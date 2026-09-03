import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { parseEdgeAssistantRequest, sse, type EdgeCommandProposal } from "../_shared/assistantProtocol.ts";
import { createValidatedAssistantSseStream } from "../_shared/assistantSseStream.ts";
import { loadExternalEvidence, type Citation } from "../_shared/externalEvidence.ts";

const localOrigins = ["http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:5173", "http://localhost:5173"];
const assistantModel = "openai/gpt-5-mini";
const encoder = new TextEncoder();

function positiveSetting(name: string, fallback: number) {
  const parsed = Number(Deno.env.get(name) ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function logAssistantRequest(requestId: string, status: string, startedAt: number, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    event: "assistant_request", requestId, model: assistantModel, status,
    durationMs: Date.now() - startedAt, ...extra,
  }));
}

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

async function createEmbedding(message: string): Promise<number[] | null> {
  try {
    const runtime = (globalThis as unknown as {
      Supabase?: { ai?: { Session: new (model: string) => { run: (text: string, options: object) => Promise<number[]> } } };
    }).Supabase;
    if (!runtime?.ai?.Session) return null;
    const embedding = await new runtime.ai.Session("gte-small").run(message.slice(0, 1_200), { mean_pool: true, normalize: true });
    return Array.isArray(embedding) && embedding.length === 384 && embedding.every(Number.isFinite) ? embedding : null;
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

async function releaseClaim(service: ReturnType<typeof createClient>, userId: string, requestId: string, message: string, durationMs: number, status: "failed" | "cancelled" = "failed") {
  await service.rpc("finalize_assistant_request", {
    p_request_id: requestId, p_user_id: userId, p_status: status, p_provider_called: false,
    p_provider_request_id: null, p_model: assistantModel, p_prompt_tokens: null,
    p_completion_tokens: null, p_total_tokens: null, p_cost_usd: null, p_duration_ms: durationMs,
    p_error_message: message, p_assistant_message_id: null, p_content: null, p_citations: [], p_proposals: [],
  });
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
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const model = assistantModel;
  if (!url || !publicKey || !serviceKey) return failure(503, origin, "MODEL_UNAVAILABLE", "Assistant persistence is not configured.", true);

  const userClient = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return failure(401, origin, "AUTH_REQUIRED", "Your session is no longer valid.");

  const { data: project, error: projectError } = await userClient.from("projects").select("id,snapshot,active_pdb_id").eq("id", input.projectId).maybeSingle();
  if (projectError || !project) return failure(404, origin, "PROJECT_NOT_FOUND", "The project does not exist or is not accessible.");

  let conversationId = input.conversationId;
  if (conversationId) {
    const { data: conversation } = await userClient.from("conversations").select("id").eq("id", conversationId).eq("project_id", input.projectId).maybeSingle();
    if (!conversation) return failure(404, origin, "PROJECT_NOT_FOUND", "The conversation is not part of this project.");
  }

  const { data: claimRows, error: claimError } = await service.rpc("claim_assistant_request", {
    p_project_id: input.projectId, p_user_id: user.id, p_request_id: input.requestId,
    p_message: input.message, p_conversation_id: conversationId ?? null, p_model: model,
    p_daily_budget_usd: positiveSetting("BIOFOLD_USER_DAILY_BUDGET_USD", 1),
    p_reservation_usd: positiveSetting("BIOFOLD_REQUEST_RESERVE_USD", 0.05),
  });
  if (claimError) return failure(503, origin, "MODEL_UNAVAILABLE", "Assistant admission control is unavailable.", true);
  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as {
    allowed?: boolean; status?: string; error_code?: string | null; ai_request_id?: string | null;
    conversation_id?: string | null;
  } | null;
  if (!claim) return failure(503, origin, "MODEL_UNAVAILABLE", "Assistant admission control returned no result.", true);
  if (claim.status === "completed") {
    const { data: previous } = await service.from("ai_requests").select("conversation_id,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,duration_ms")
      .eq("request_id", input.requestId).eq("user_id", user.id).maybeSingle();
    if (previous?.conversation_id) {
      const { data: stored } = await service.from("messages").select("id,content,citations,proposals").eq("conversation_id", previous.conversation_id).eq("request_id", input.requestId).eq("sender", "assistant").maybeSingle();
      if (stored) {
        const events = [sse("meta", { requestId: input.requestId, conversationId: previous.conversation_id, assistantMessageId: stored.id }), sse("delta", { text: stored.content }), sse("citations", { citations: stored.citations ?? [] }), sse("proposals", { proposals: stored.proposals ?? [] })];
        if (previous.prompt_tokens != null && previous.completion_tokens != null && previous.total_tokens != null) events.push(sse("usage", { usage: { model: previous.model, promptTokens: previous.prompt_tokens, completionTokens: previous.completion_tokens, totalTokens: previous.total_tokens, ...(previous.cost_usd == null ? {} : { costUsd: Number(previous.cost_usd) }), ...(previous.duration_ms == null ? {} : { durationMs: previous.duration_ms }) } }));
        events.push(sse("done", { interrupted: false }));
        logAssistantRequest(input.requestId, "replayed", startedAt, { conversationId: previous.conversation_id });
        return streamResponse(origin, events);
      }
    }
    return failure(503, origin, "STREAM_FAILED", "The completed response could not be replayed.", true);
  }
  if (!claim.allowed) {
    logAssistantRequest(input.requestId, claim.status ?? "rejected", startedAt, { errorCode: claim.error_code ?? "CONFLICT" });
    if (claim.error_code === "RATE_LIMITED") return failure(429, origin, "RATE_LIMITED", "Too many assistant requests. Please wait one minute.", true);
    if (claim.error_code === "BUDGET_EXCEEDED") return failure(402, origin, "BUDGET_EXCEEDED", "The free daily Assistant limit has been reached. It resets at 00:00 UTC tomorrow.");
    return failure(409, origin, "CONFLICT", "This request identifier is active or has already failed. Retry with a new requestId.", true);
  }

  conversationId = claim.conversation_id ?? conversationId;
  if (!conversationId) {
    await releaseClaim(service, user.id, input.requestId, "Admission did not return a conversation.", Date.now() - startedAt);
    return failure(503, origin, "MODEL_UNAVAILABLE", "The conversation could not be created.", true);
  }

  const assistantMessageId = crypto.randomUUID();
  try {
    if (!openRouterKey) throw new Error("OpenRouter is not configured for this environment.");

    const externalSignal = AbortSignal.any([request.signal, AbortSignal.timeout(2_500)]);
    const [embedding, historyResult, external] = await Promise.all([
      createEmbedding(input.message),
      service.from("messages").select("sender,content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10),
      loadExternalEvidence(service, project.active_pdb_id, input.requestId, externalSignal).catch((error) => {
        if (request.signal.aborted) throw error;
        return { context: "", citations: [] };
      }),
    ]);
    const { data: chunks, error: searchError } = await service.rpc("hybrid_search_knowledge", {
      query_text: input.message, query_embedding: embedding, match_count: 6, max_semantic_distance: 0.35,
    });
    if (searchError) throw searchError;
    const history = historyResult.data;
    const retrieved = (chunks ?? []) as Array<{ chunk_id: string; title: string; content: string; locator: string | null; publisher: Citation["publisher"]; url: string; retrieved_at: string }>;
    const citations: Citation[] = [...external.citations, ...retrieved.map((chunk) => ({
      id: chunk.chunk_id, title: chunk.title, publisher: chunk.publisher, url: chunk.url,
      ...(chunk.locator ? { locator: chunk.locator } : {}), retrievedAt: new Date(chunk.retrieved_at).toISOString(),
    }))].filter((citation, index, all) => all.findIndex((candidate) => candidate.url === citation.url) === index);
    const body = createValidatedAssistantSseStream({
      requestId: input.requestId,
      conversationId,
      assistantMessageId,
      model,
      apiKey: openRouterKey,
      siteUrl: Deno.env.get("OPENROUTER_SITE_URL"),
      prompt: promptFor({ question: input.message, snapshot: project.snapshot, history: (history ?? []).reverse(), chunks: retrieved, externalContext: external.context }),
      citations,
      signal: request.signal,
      onProviderCalled: async () => {
        const { error } = await service.from("ai_requests").update({ provider_called: true }).eq("request_id", input.requestId).eq("user_id", user.id).eq("status", "running");
        if (error) throw error;
      },
      persist: async (generated, durationMs) => {
        const proposals = generated.proposals as EdgeCommandProposal[];
        const { error } = await service.rpc("finalize_assistant_request", {
          p_request_id: input.requestId, p_user_id: user.id, p_status: "completed", p_provider_called: true,
          p_provider_request_id: generated.providerRequestId ?? null, p_model: model,
          p_prompt_tokens: generated.usage?.promptTokens ?? null, p_completion_tokens: generated.usage?.completionTokens ?? null,
          p_total_tokens: generated.usage?.totalTokens ?? null, p_cost_usd: generated.usage?.costUsd ?? null,
          p_duration_ms: durationMs, p_error_message: null, p_assistant_message_id: assistantMessageId,
          p_content: generated.answer, p_citations: citations, p_proposals: proposals,
        });
        if (error) throw error;
      },
      interrupt: async ({ cancelled, providerCalled, providerRequestId, durationMs }) => {
        const { error } = await service.rpc("finalize_assistant_request", {
          p_request_id: input.requestId, p_user_id: user.id, p_status: cancelled ? "cancelled" : "failed",
          p_provider_called: providerCalled, p_provider_request_id: providerRequestId ?? null, p_model: model,
          p_prompt_tokens: null, p_completion_tokens: null, p_total_tokens: null, p_cost_usd: null,
          p_duration_ms: durationMs, p_error_message: cancelled ? "Request cancelled." : "Provider or validation failure.",
          p_assistant_message_id: null, p_content: null, p_citations: [], p_proposals: [],
        });
        if (error) throw error;
      },
    });
    return new Response(body, {
      headers: { ...cors(origin), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    const cancelled = request.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    await releaseClaim(service, user.id, input.requestId, cancelled ? "Request cancelled." : "Retrieval failed before provider call.", Date.now() - startedAt, cancelled ? "cancelled" : "failed");
    logAssistantRequest(input.requestId, cancelled ? "cancelled_before_provider" : "failed_before_provider", startedAt);
    return failure(cancelled ? 499 : 503, origin, cancelled ? "CANCELLED" : "MODEL_UNAVAILABLE",
      cancelled ? "The assistant request was cancelled." : "The scientific assistant is temporarily unavailable.", !cancelled);
  }
});
