import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { parseEdgeAssistantRequest, sse, type EdgeCommandProposal } from "../_shared/assistantProtocol.ts";
import { requestOpenRouter } from "../_shared/openRouter.ts";

const localOrigins = ["http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5173", "http://localhost:5173"];
const encoder = new TextEncoder();

function origins() {
  const configured = Deno.env.get("BIOFOLD_ALLOWED_ORIGINS")?.split(",").map((item) => item.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : localOrigins);
}

function cors(origin: string | null) {
  return {
    ...(origin && origins().has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function failure(status: number, origin: string | null, code: string, message: string, retryable = false) {
  return Response.json({ error: { code, message, retryable } }, { status, headers: cors(origin) });
}

function streamResponse(origin: string | null, events: string[]) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  }), {
    headers: { ...cors(origin), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

type Citation = {
  id: string; title: string; publisher: "BioFold" | "RCSB PDB" | "UniProt";
  url: string; locator?: string; retrievedAt: string;
};

type ExternalEvidence = { context: string; citations: Citation[] };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function fetchJson(url: string, init: RequestInit, signal: AbortSignal) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(6_000)]);
  const response = await fetch(url, { ...init, signal: combined });
  if (!response.ok) throw new Error(`Scientific metadata request failed with HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

async function loadExternalEvidence(service: ReturnType<typeof createClient>, pdbId: string | null, signal: AbortSignal): Promise<ExternalEvidence> {
  if (!pdbId) return { context: "", citations: [] };
  const normalized = pdbId.toUpperCase();
  try {
    const { data: cached } = await service.from("structure_metadata").select("summary,expires_at").eq("pdb_id", normalized).maybeSingle();
    const summary = record(cached?.summary);
    if (cached && new Date(cached.expires_at).getTime() > Date.now() && typeof summary.context === "string" && Array.isArray(summary.citations)) {
      return { context: summary.context, citations: summary.citations as Citation[] };
    }

    const now = new Date().toISOString();
    const entry = record(await fetchJson(`https://data.rcsb.org/rest/v1/core/entry/${encodeURIComponent(normalized)}`, {}, signal));
    const structure = record(entry.struct);
    const info = record(entry.rcsb_entry_info);
    const accession = record(entry.rcsb_accession_info);
    const experiments = Array.isArray(entry.exptl) ? entry.exptl.map(record) : [];
    const resolution = Array.isArray(info.resolution_combined) && typeof info.resolution_combined[0] === "number" ? info.resolution_combined[0] : null;
    const title = typeof structure.title === "string" ? structure.title : `RCSB structure ${normalized}`;
    const method = typeof experiments[0]?.method === "string" ? experiments[0].method : null;
    const parts = [`RCSB PDB ${normalized}: ${title}.`, method ? `Experimental method: ${method}.` : "", resolution ? `Reported resolution: ${resolution} Å.` : ""].filter(Boolean);
    const citations: Citation[] = [{ id: `rcsb-${normalized}`, title, publisher: "RCSB PDB", url: `https://www.rcsb.org/structure/${normalized}`, locator: `Entry ${normalized}`, retrievedAt: now }];

    try {
      const query = `query BioFoldMappings($id: String!) { entry(entry_id: $id) { polymer_entities { rcsb_polymer_entity_container_identifiers { reference_sequence_identifiers { database_accession database_name } } } } }`;
      const graph = record(await fetchJson("https://data.rcsb.org/graphql", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { id: normalized } }),
      }, signal));
      const data = record(graph.data);
      const graphEntry = record(data.entry);
      const entities = Array.isArray(graphEntry.polymer_entities) ? graphEntry.polymer_entities.map(record) : [];
      const uniprot = entities.flatMap((entity) => {
        const identifiers = record(entity.rcsb_polymer_entity_container_identifiers);
        return Array.isArray(identifiers.reference_sequence_identifiers) ? identifiers.reference_sequence_identifiers.map(record) : [];
      }).find((identifier) => String(identifier.database_name).toUpperCase() === "UNIPROT");
      const accessionId = typeof uniprot?.database_accession === "string" ? uniprot.database_accession : null;
      if (accessionId) {
        const protein = record(await fetchJson(`https://rest.uniprot.org/uniprotkb/${encodeURIComponent(accessionId)}.json`, {}, signal));
        const description = record(protein.proteinDescription);
        const recommended = record(description.recommendedName);
        const fullName = record(recommended.fullName);
        const organism = record(protein.organism);
        const proteinName = typeof fullName.value === "string" ? fullName.value : accessionId;
        const organismName = typeof organism.scientificName === "string" ? organism.scientificName : "unknown organism";
        parts.push(`UniProt ${accessionId}: ${proteinName}; organism: ${organismName}.`);
        citations.push({ id: `uniprot-${accessionId}`, title: proteinName, publisher: "UniProt", url: `https://www.uniprot.org/uniprotkb/${encodeURIComponent(accessionId)}/entry`, locator: accessionId, retrievedAt: now });
      }
    } catch {
      // RCSB evidence remains usable when mapping or UniProt is unavailable.
    }

    const evidence = { context: parts.join(" "), citations };
    await service.from("structure_metadata").upsert({
      pdb_id: normalized, title, deposition_date: typeof accession.deposit_date === "string" ? accession.deposit_date.slice(0, 10) : null,
      release_date: typeof accession.initial_release_date === "string" ? accession.initial_release_date.slice(0, 10) : null,
      experimental_method: method, resolution, summary: evidence,
      cached_at: now, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    });
    return evidence;
  } catch {
    return { context: "", citations: [] };
  }
}

async function createEmbedding(message: string): Promise<number[] | null> {
  try {
    const runtime = (globalThis as unknown as {
      Supabase?: { ai?: { Session: new (model: string) => { run: (text: string, options: object) => Promise<number[]> } } };
    }).Supabase;
    if (!runtime?.ai?.Session) return null;
    return await new runtime.ai.Session("gte-small").run(message, { mean_pool: true, normalize: true });
  } catch {
    return null;
  }
}

function promptFor(input: {
  question: string;
  snapshot: unknown;
  history: Array<{ sender: string; content: string }>;
  chunks: Array<{ title: string; content: string; locator: string | null }>;
  externalContext: string;
}) {
  const context = input.chunks.map((chunk, index) => `[S${index + 1}] ${chunk.title}${chunk.locator ? ` — ${chunk.locator}` : ""}\n${chunk.content}`).join("\n\n");
  const history = input.history.map((message) => `${message.sender}: ${message.content}`).join("\n");
  return `You are BioFold's scientific assistant. Distinguish observed, calculated, heuristic and unavailable evidence. Never claim molecular simulation, stability prediction, docking, clinical effect, or coordinate mutation. Use only the supplied project snapshot and retrieved sources. If proposing a scene action, use at most three of the eight audited commands and valid narrow inputs. A proposal is never executed automatically. Do not invent citations; citations are attached by the server.\n\nProject snapshot:\n${JSON.stringify(input.snapshot).slice(0, 12_000)}\n\nRecent conversation:\n${history.slice(-8_000)}\n\nRCSB/UniProt context:\n${input.externalContext || "Unavailable for this request."}\n\nCurated sources:\n${context.slice(0, 12_000)}\n\nUser question:\n${input.question}`;
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const origin = request.headers.get("Origin");
  if (origin && !origins().has(origin)) return failure(403, null, "ORIGIN_NOT_ALLOWED", "This origin is not allowed to call BioFold Assistant.");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return failure(405, origin, "METHOD_NOT_ALLOWED", "Use POST for assistant requests.");

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return failure(401, origin, "AUTH_REQUIRED", "Sign in before using BioFold Assistant.");

  let input;
  try { input = parseEdgeAssistantRequest(await request.json()); }
  catch (error) { return failure(400, origin, "INVALID_INPUT", error instanceof Error ? error.message : "Invalid request."); }

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = Deno.env.get("OPENROUTER_MODEL");
  if (!url || !publicKey || !serviceKey) return failure(503, origin, "MODEL_UNAVAILABLE", "Assistant persistence is not configured.", true);

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return failure(401, origin, "AUTH_REQUIRED", "Your session is no longer valid.");

  const { data: project, error: projectError } = await userClient.from("projects").select("id,snapshot,active_pdb_id").eq("id", input.projectId).maybeSingle();
  if (projectError || !project) return failure(404, origin, "PROJECT_NOT_FOUND", "The project does not exist or is not accessible.");

  const { data: previous } = await service.from("ai_requests").select("status,conversation_id,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,duration_ms")
    .eq("request_id", input.requestId).eq("user_id", user.id).maybeSingle();
  if (previous?.status === "running") return failure(409, origin, "CONFLICT", "This assistant request is already running.", true);
  if (previous?.status === "completed" && previous.conversation_id) {
    const { data: stored } = await service.from("messages").select("id,content,citations,proposals").eq("conversation_id", previous.conversation_id)
      .eq("request_id", input.requestId).eq("sender", "assistant").maybeSingle();
    if (stored) return streamResponse(origin, [
      sse("meta", { requestId: input.requestId, conversationId: previous.conversation_id, assistantMessageId: stored.id }),
      sse("delta", { text: stored.content }),
      sse("citations", { citations: stored.citations ?? [] }),
      sse("proposals", { proposals: stored.proposals ?? [] }),
      sse("usage", { usage: { model: previous.model, promptTokens: previous.prompt_tokens, completionTokens: previous.completion_tokens, totalTokens: previous.total_tokens, ...(previous.cost_usd == null ? {} : { costUsd: Number(previous.cost_usd) }), ...(previous.duration_ms == null ? {} : { durationMs: previous.duration_ms }) } }),
      sse("done", { interrupted: false }),
    ]);
  }

  let conversationId = input.conversationId;
  let createdConversation = false;
  if (conversationId) {
    const { data: conversation } = await userClient.from("conversations").select("id").eq("id", conversationId).eq("project_id", input.projectId).maybeSingle();
    if (!conversation) return failure(404, origin, "PROJECT_NOT_FOUND", "The conversation is not part of this project.");
  } else {
    const { data: conversation, error } = await service.from("conversations").insert({ project_id: input.projectId, title: input.message.slice(0, 80) }).select("id").single();
    if (error || !conversation) return failure(503, origin, "MODEL_UNAVAILABLE", "The conversation could not be created.", true);
    conversationId = conversation.id;
    createdConversation = true;
  }

  const { error: claimError } = await service.from("ai_requests").insert({
    project_id: input.projectId, conversation_id: conversationId, user_id: user.id,
    request_id: input.requestId, model: model ?? "unconfigured", status: "running",
  });
  if (claimError) {
    if (createdConversation) await service.from("conversations").delete().eq("id", conversationId);
    return failure(409, origin, "CONFLICT", "This request identifier has already been used.", true);
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await service.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", oneMinuteAgo);
  if ((count ?? 0) > 6) {
    await service.from("ai_requests").update({ status: "rate_limited", duration_ms: Date.now() - startedAt }).eq("request_id", input.requestId).eq("user_id", user.id);
    return failure(429, origin, "RATE_LIMITED", "Too many assistant requests. Please wait one minute.", true);
  }

  const assistantMessageId = crypto.randomUUID();
  try {
    const { error: userMessageError } = await service.from("messages").insert({
      conversation_id: conversationId, request_id: input.requestId, sender: "user", content: input.message,
    });
    if (userMessageError) throw userMessageError;
    if (!openRouterKey || !model) throw new Error("OpenRouter is not configured for this environment.");

    const embedding = await createEmbedding(input.message);
    const { data: chunks, error: searchError } = await service.rpc("hybrid_search_knowledge", {
      query_text: input.message, query_embedding: embedding, match_count: 6,
    });
    if (searchError) throw searchError;
    const { data: history } = await service.from("messages").select("sender,content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10);
    const external = await loadExternalEvidence(service, project.active_pdb_id, request.signal);
    const retrieved = (chunks ?? []) as Array<{ chunk_id: string; title: string; content: string; locator: string | null; publisher: Citation["publisher"]; url: string; retrieved_at: string }>;
    const citations: Citation[] = [...external.citations, ...retrieved.map((chunk) => ({
      id: chunk.chunk_id, title: chunk.title, publisher: chunk.publisher, url: chunk.url,
      ...(chunk.locator ? { locator: chunk.locator } : {}), retrievedAt: new Date(chunk.retrieved_at).toISOString(),
    }))].filter((citation, index, all) => all.findIndex((candidate) => candidate.url === citation.url) === index);
    const generated = await requestOpenRouter({
      apiKey: openRouterKey, model, signal: request.signal, siteUrl: Deno.env.get("OPENROUTER_SITE_URL"),
      prompt: promptFor({ question: input.message, snapshot: project.snapshot, history: (history ?? []).reverse(), chunks: retrieved, externalContext: external.context }),
    });
    if (request.signal.aborted) throw new DOMException("The request was cancelled.", "AbortError");

    const proposals = generated.proposals as EdgeCommandProposal[];
    const durationMs = Date.now() - startedAt;
    const { error: assistantMessageError } = await service.from("messages").insert({
      id: assistantMessageId, conversation_id: conversationId, request_id: input.requestId,
      sender: "assistant", content: generated.answer, citations, proposals,
    });
    if (assistantMessageError) throw assistantMessageError;
    await service.from("ai_requests").update({
      model, prompt_tokens: generated.usage.promptTokens, completion_tokens: generated.usage.completionTokens,
      total_tokens: generated.usage.totalTokens, cost_usd: generated.usage.costUsd ?? null,
      duration_ms: durationMs, status: "completed",
    }).eq("request_id", input.requestId).eq("user_id", user.id);

    const words = generated.answer.match(/\S+\s*/g) ?? [generated.answer];
    const deltas: string[] = [];
    for (let index = 0; index < words.length; index += 12) deltas.push(words.slice(index, index + 12).join(""));
    return streamResponse(origin, [
      sse("meta", { requestId: input.requestId, conversationId, assistantMessageId }),
      ...deltas.map((text) => sse("delta", { text })),
      sse("citations", { citations }),
      sse("proposals", { proposals }),
      sse("usage", { usage: { model, ...generated.usage, durationMs } }),
      sse("done", { interrupted: false }),
    ]);
  } catch (error) {
    const cancelled = request.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    await service.from("ai_requests").update({ status: cancelled ? "cancelled" : "failed", duration_ms: Date.now() - startedAt }).eq("request_id", input.requestId).eq("user_id", user.id);
    return failure(cancelled ? 499 : 503, origin, cancelled ? "CANCELLED" : "MODEL_UNAVAILABLE",
      cancelled ? "The assistant request was cancelled." : "The scientific assistant is temporarily unavailable.", !cancelled);
  }
});
