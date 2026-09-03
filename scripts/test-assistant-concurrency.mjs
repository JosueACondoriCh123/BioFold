import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and a server-only Supabase key.");

const administrator = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let projectId = process.env.BIOFOLD_CONCURRENCY_PROJECT_ID;
let conversationId = process.env.BIOFOLD_CONCURRENCY_CONVERSATION_ID;
let userId = process.env.BIOFOLD_CONCURRENCY_USER_ID;
let temporaryUserId;

async function provisionFixture() {
  if (projectId && conversationId && userId) return;
  const nonce = randomUUID();
  const { data: created, error: userError } = await administrator.auth.admin.createUser({
    email: `biofold-concurrency-${nonce}@example.test`,
    password: `${nonce}Aa1!`,
    email_confirm: true,
  });
  if (userError || !created.user) throw userError ?? new Error("Temporary concurrency user was not created.");
  temporaryUserId = created.user.id;
  userId = created.user.id;
  const { data: project, error: projectError } = await administrator.from("projects")
    .insert({ owner_id: userId, title: "Assistant concurrency gate" }).select("id").single();
  if (projectError || !project) throw projectError ?? new Error("Temporary project was not created.");
  projectId = project.id;
  const { data: conversation, error: conversationError } = await administrator.from("conversations")
    .insert({ project_id: projectId, title: "Atomic admission" }).select("id").single();
  if (conversationError || !conversation) throw conversationError ?? new Error("Temporary conversation was not created.");
  conversationId = conversation.id;
}

try {
  await provisionFixture();
  const prefix = `concurrency-${randomUUID()}`;
  const clients = Array.from({ length: 7 }, () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
  const results = await Promise.all(clients.map(async (client, index) => {
    const requestId = `${prefix}-${index + 1}`;
    const { data, error } = await client.rpc("claim_assistant_request", {
      p_project_id: projectId, p_user_id: userId, p_request_id: requestId,
      p_message: `Atomic concurrency check ${index + 1}`,
      p_conversation_id: conversationId, p_model: "openai/gpt-5-mini",
      p_daily_budget_usd: 1, p_reservation_usd: 0.05,
    });
    if (error) throw error;
    return { client, requestId, row: Array.isArray(data) ? data[0] : data };
  }));
  const admitted = results.filter(({ row }) => row?.allowed && row?.status === "running");
  const rejected = results.filter(({ row }) => !row?.allowed && row?.error_code === "RATE_LIMITED");
  if (admitted.length !== 6 || rejected.length !== 1) {
    throw new Error(`Atomic gate failed: admitted=${admitted.length}, rateLimited=${rejected.length}.`);
  }
  await Promise.all(admitted.map(({ client, requestId }) => client.rpc("finalize_assistant_request", {
    p_request_id: requestId, p_user_id: userId, p_status: "cancelled",
    p_provider_called: false, p_provider_request_id: null, p_model: "openai/gpt-5-mini",
    p_prompt_tokens: null, p_completion_tokens: null, p_total_tokens: null,
    p_cost_usd: null, p_duration_ms: 0, p_error_message: "Concurrency test cleanup",
    p_assistant_message_id: null, p_content: null, p_citations: null, p_proposals: null,
  })));
  console.log(JSON.stringify({ admitted: admitted.length, rateLimited: rejected.length }));
} finally {
  if (temporaryUserId) await administrator.auth.admin.deleteUser(temporaryUserId);
}
