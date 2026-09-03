import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";
import { canUseStale, freshCacheOutcome, providerCacheOutcome } from "./externalCachePolicy.ts";

export type Citation = {
  id: string;
  title: string;
  publisher: "BioFold" | "RCSB PDB" | "UniProt";
  url: string;
  locator?: string;
  retrievedAt: string;
};

export type ExternalEvidence = { context: string; citations: Citation[] };
type Provider = "rcsb" | "uniprot";
type CacheOutcome = "hit" | "miss" | "revalidated" | "stale_fallback" | "unavailable";
type CachedEntry = {
  provider: Provider; cache_key: string; status_code: number; payload: unknown;
  etag: string | null; last_modified: string | null; fetched_at: string; fresh_until: string; stale_until: string;
};

const FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
const STALE_MS = 30 * 24 * 60 * 60 * 1_000;
const NEGATIVE_MS = 60 * 60 * 1_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function metric(service: SupabaseClient, input: {
  requestId: string; provider: Provider; cacheKey: string; outcome: CacheOutcome; status?: number; latencyMs: number;
}) {
  const { error } = await service.from("external_evidence_metrics").insert({
    request_id: input.requestId, provider: input.provider, cache_key: input.cacheKey,
    outcome: input.outcome, http_status: input.status ?? null, latency_ms: input.latencyMs,
  });
  if (error) console.error(JSON.stringify({ event: "external_metric_failed", requestId: input.requestId, provider: input.provider, code: error.code }));
}

async function providerJson(input: {
  service: SupabaseClient; requestId: string; provider: Provider; cacheKey: string; url: string;
  init?: RequestInit; signal: AbortSignal; now?: number;
}): Promise<{ payload: unknown | null; retrievedAt: string; outcome: CacheOutcome }> {
  const now = input.now ?? Date.now();
  const started = performance.now();
  const { data } = await input.service.from("external_evidence_cache").select("provider,cache_key,status_code,payload,etag,last_modified,fetched_at,fresh_until,stale_until")
    .eq("provider", input.provider).eq("cache_key", input.cacheKey).maybeSingle();
  const cached = data as CachedEntry | null;
  const policyEntry = cached ? { statusCode: cached.status_code, freshUntil: cached.fresh_until, staleUntil: cached.stale_until } : null;
  if (freshCacheOutcome(policyEntry, now) === "hit") {
    await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "hit", status: cached.status_code, latencyMs: Math.round(performance.now() - started) });
    return { payload: cached.status_code === 404 ? null : cached.payload, retrievedAt: cached.fetched_at, outcome: "hit" };
  }

  const headers = new Headers(input.init?.headers);
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  if (cached?.last_modified) headers.set("If-Modified-Since", cached.last_modified);
  try {
    const response = await fetch(input.url, {
      ...input.init,
      headers,
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(6_000)]),
    });
    const latencyMs = Math.round(performance.now() - started);
    const outcome = providerCacheOutcome(response.status, policyEntry, now);
    if (outcome === "revalidated" && cached) {
      const fetchedAt = new Date(now).toISOString();
      await input.service.from("external_evidence_cache").update({
        fetched_at: fetchedAt, fresh_until: new Date(now + FRESH_MS).toISOString(), stale_until: new Date(now + STALE_MS).toISOString(),
      }).eq("provider", input.provider).eq("cache_key", input.cacheKey);
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "revalidated", status: 304, latencyMs });
      return { payload: cached.payload, retrievedAt: fetchedAt, outcome: "revalidated" };
    }
    if (response.status === 404) {
      const fetchedAt = new Date(now).toISOString();
      await input.service.from("external_evidence_cache").upsert({
        provider: input.provider, cache_key: input.cacheKey, status_code: 404, payload: null,
        etag: response.headers.get("ETag"), last_modified: response.headers.get("Last-Modified"), fetched_at: fetchedAt,
        fresh_until: new Date(now + NEGATIVE_MS).toISOString(), stale_until: new Date(now + NEGATIVE_MS).toISOString(),
      }, { onConflict: "provider,cache_key" });
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "miss", status: 404, latencyMs });
      return { payload: null, retrievedAt: fetchedAt, outcome: "miss" };
    }
    if (response.ok) {
      const payload = await response.json() as unknown;
      const fetchedAt = new Date(now).toISOString();
      await input.service.from("external_evidence_cache").upsert({
        provider: input.provider, cache_key: input.cacheKey, status_code: response.status, payload,
        etag: response.headers.get("ETag"), last_modified: response.headers.get("Last-Modified"), fetched_at: fetchedAt,
        fresh_until: new Date(now + FRESH_MS).toISOString(), stale_until: new Date(now + STALE_MS).toISOString(),
      }, { onConflict: "provider,cache_key" });
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "miss", status: response.status, latencyMs });
      return { payload, retrievedAt: fetchedAt, outcome: "miss" };
    }
    if (outcome === "stale_fallback" && cached) {
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "stale_fallback", status: response.status, latencyMs });
      return { payload: cached.payload, retrievedAt: cached.fetched_at, outcome: "stale_fallback" };
    }
    await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "unavailable", status: response.status, latencyMs });
    return { payload: null, retrievedAt: new Date(now).toISOString(), outcome: "unavailable" };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    if (input.signal.aborted) {
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "unavailable", latencyMs });
      throw error;
    }
    if (cached && canUseStale(policyEntry, now)) {
      await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "stale_fallback", latencyMs });
      return { payload: cached.payload, retrievedAt: cached.fetched_at, outcome: "stale_fallback" };
    }
    await metric(input.service, { requestId: input.requestId, provider: input.provider, cacheKey: input.cacheKey, outcome: "unavailable", latencyMs });
    return { payload: null, retrievedAt: new Date(now).toISOString(), outcome: "unavailable" };
  }
}

export async function loadExternalEvidence(service: SupabaseClient, pdbId: string | null, requestId: string, signal: AbortSignal): Promise<ExternalEvidence> {
  if (!pdbId) return { context: "", citations: [] };
  const normalized = pdbId.toUpperCase();
  const entryResult = await providerJson({ service, requestId, provider: "rcsb", cacheKey: `entry:${normalized}`, url: `https://data.rcsb.org/rest/v1/core/entry/${encodeURIComponent(normalized)}`, signal });
  if (!entryResult.payload) return { context: "", citations: [] };
  const entry = record(entryResult.payload);
  const structure = record(entry.struct);
  const info = record(entry.rcsb_entry_info);
  const experiments = Array.isArray(entry.exptl) ? entry.exptl.map(record) : [];
  const title = typeof structure.title === "string" ? structure.title : `RCSB structure ${normalized}`;
  const method = typeof experiments[0]?.method === "string" ? experiments[0].method : null;
  const resolution = Array.isArray(info.resolution_combined) && typeof info.resolution_combined[0] === "number" ? info.resolution_combined[0] : null;
  const parts = [`RCSB PDB ${normalized}: ${title}.`, method ? `Experimental method: ${method}.` : "", resolution ? `Reported resolution: ${resolution} Å.` : ""].filter(Boolean);
  const citations: Citation[] = [{ id: `rcsb-${normalized}`, title, publisher: "RCSB PDB", url: `https://www.rcsb.org/structure/${normalized}`, locator: `Entry ${normalized}`, retrievedAt: entryResult.retrievedAt }];

  const query = `query BioFoldMappings($id: String!) { entry(entry_id: $id) { polymer_entities { rcsb_polymer_entity_container_identifiers { reference_sequence_identifiers { database_accession database_name } } } } }`;
  const mappingResult = await providerJson({
    service, requestId, provider: "rcsb", cacheKey: `mapping:${normalized}`, url: "https://data.rcsb.org/graphql",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { id: normalized } }) }, signal,
  });
  const mappingData = record(record(mappingResult.payload).data);
  const mappingEntry = record(mappingData.entry);
  const entities = Array.isArray(mappingEntry.polymer_entities) ? mappingEntry.polymer_entities.map(record) : [];
  const identifiers = entities.flatMap((entity) => {
    const container = record(entity.rcsb_polymer_entity_container_identifiers);
    return Array.isArray(container.reference_sequence_identifiers) ? container.reference_sequence_identifiers.map(record) : [];
  });
  const accession = identifiers.find((identifier) => String(identifier.database_name).toUpperCase() === "UNIPROT")?.database_accession;
  if (typeof accession === "string") {
    const proteinResult = await providerJson({ service, requestId, provider: "uniprot", cacheKey: `entry:${accession}`, url: `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(accession)}.json`, signal });
    if (proteinResult.payload) {
      const protein = record(proteinResult.payload);
      const fullName = record(record(record(protein.proteinDescription).recommendedName).fullName);
      const proteinName = typeof fullName.value === "string" ? fullName.value : accession;
      const organism = record(protein.organism);
      const organismName = typeof organism.scientificName === "string" ? organism.scientificName : "unknown organism";
      parts.push(`UniProt ${accession}: ${proteinName}; organism: ${organismName}.`);
      citations.push({ id: `uniprot-${accession}`, title: proteinName, publisher: "UniProt", url: `https://www.uniprot.org/uniprotkb/${encodeURIComponent(accession)}/entry`, locator: accession, retrievedAt: proteinResult.retrievedAt });
    }
  }
  return { context: parts.join(" "), citations };
}
