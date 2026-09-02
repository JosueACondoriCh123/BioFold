import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAssistantStreamEvent } from "./assistantClient";
import { parseCommandProposal } from "../types/assistant";
import type { AssistantHistoryPort, PersistedAssistantMessage } from "../types/assistant";
import type { Database } from "../types/database.types";

function parseStoredMessage(row: Database["public"]["Tables"]["messages"]["Row"]): PersistedAssistantMessage {
  if (row.sender !== "user" && row.sender !== "assistant" && row.sender !== "system") {
    throw new Error("Stored assistant history contains an unsupported sender.");
  }
  const citations = row.citations == null
    ? []
    : (parseAssistantStreamEvent({ type: "citations", citations: row.citations }) as { type: "citations"; citations: PersistedAssistantMessage["citations"] }).citations;
  if (row.proposals != null && !Array.isArray(row.proposals)) throw new Error("Stored proposals must be an array.");
  return {
    id: row.id,
    sender: row.sender,
    content: row.content,
    citations,
    proposals: (row.proposals ?? []).map(parseCommandProposal),
    createdAt: row.created_at,
  };
}

export class SupabaseAssistantHistoryAdapter implements AssistantHistoryPort {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async loadLatest(projectId: string, options?: { signal?: AbortSignal }) {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let conversationQuery = this.client.from("conversations").select("id").eq("project_id", projectId)
      .order("updated_at", { ascending: false }).limit(1);
    if (options?.signal) conversationQuery = conversationQuery.abortSignal(options.signal);
    const { data: conversations, error: conversationError } = await conversationQuery;
    if (conversationError) throw new Error(conversationError.message);
    const conversationId = conversations?.[0]?.id;
    if (!conversationId) return null;

    let messageQuery = this.client.from("messages").select("*").eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(100);
    if (options?.signal) messageQuery = messageQuery.abortSignal(options.signal);
    const { data: messages, error: messageError } = await messageQuery;
    if (messageError) throw new Error(messageError.message);
    return { conversationId, messages: (messages ?? []).map(parseStoredMessage) };
  }
}

export class EmptyAssistantHistoryAdapter implements AssistantHistoryPort {
  async loadLatest() { return null; }
}
