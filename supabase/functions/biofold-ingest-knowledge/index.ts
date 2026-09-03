import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { sha256Text, validateKnowledgePayload } from "../_shared/knowledgePayload.ts";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function response(status: number, body: unknown) {
  return Response.json(body, { status, headers: jsonHeaders });
}

async function embed(content: string): Promise<number[]> {
  const runtime = (globalThis as unknown as {
    Supabase?: { ai?: { Session: new (model: string) => { run: (text: string, options: object) => Promise<number[]> } } };
  }).Supabase;
  if (!runtime?.ai?.Session) throw new Error("Supabase AI inference is unavailable.");
  const vector = await new runtime.ai.Session("gte-small").run(content, { mean_pool: true, normalize: true });
  if (!Array.isArray(vector) || vector.length !== 384 || vector.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error("gte-small returned an invalid embedding.");
  }
  const norm = Math.sqrt(vector.reduce((sum, entry) => sum + entry * entry, 0));
  if (Math.abs(norm - 1) > 0.01) throw new Error("gte-small embedding is not normalized.");
  return vector;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } });
  const configuredToken = Deno.env.get("BIOFOLD_INGEST_TOKEN");
  const suppliedToken = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!configuredToken || !suppliedToken || suppliedToken !== configuredToken) return response(401, { error: { code: "AUTH_REQUIRED", message: "Invalid ingestion credential." } });
  const url = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secretKey) return response(503, { error: { code: "NOT_CONFIGURED", message: "Administrative persistence is unavailable." } });

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const service = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let runCreated = false;
  try {
    const payload = validateKnowledgePayload(await request.json());
    const sourceCount = payload.sources.length;
    const chunkCount = payload.sources.reduce((sum, source) => sum + source.chunks.length, 0);
    const { error: runError } = await service.from("knowledge_ingestion_runs").insert({
      id: runId, corpus_version: payload.corpusVersion, embedding_model: "gte-small", embedding_dimensions: 384,
      status: "running", source_count: sourceCount, chunk_count: chunkCount, started_at: startedAt,
    });
    if (runError) throw runError;
    runCreated = true;
    const results: Array<{ sourceId: string; status: "ingested" | "skipped"; chunks: number }> = [];
    for (const source of payload.sources) {
      for (const chunk of source.chunks) {
        if (await sha256Text(chunk.content) !== chunk.checksum) throw new Error(`Checksum mismatch for ${source.id} chunk ${chunk.index}.`);
      }
      const [{ data: stored }, complete] = await Promise.all([
        service.from("knowledge_sources").select("sha256").eq("id", source.id).maybeSingle(),
        service.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("source_id", source.id).not("embedding", "is", null),
      ]);
      if (stored?.sha256 === source.checksum && (complete.count ?? 0) === source.chunks.length) {
        results.push({ sourceId: source.id, status: "skipped", chunks: source.chunks.length });
        continue;
      }
      const chunks = [];
      for (const chunk of source.chunks) chunks.push({ ...chunk, embedding: await embed(chunk.content) });
      const { error } = await service.rpc("replace_knowledge_source", {
        p_run_id: runId,
        p_corpus_version: payload.corpusVersion,
        p_source: source,
        p_chunks: chunks,
      });
      if (error) throw error;
      results.push({ sourceId: source.id, status: "ingested", chunks: chunks.length });
    }
    const { error: completeError } = await service.from("knowledge_ingestion_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId);
    if (completeError) throw completeError;
    return response(200, { runId, corpusVersion: payload.corpusVersion, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge ingestion failed.";
    if (runCreated) await service.from("knowledge_ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message.slice(0, 1_000) }).eq("id", runId);
    console.error(JSON.stringify({ event: "knowledge_ingestion_failed", runId, message }));
    return response(400, { error: { code: "INVALID_INGESTION", message }, runId });
  }
});
