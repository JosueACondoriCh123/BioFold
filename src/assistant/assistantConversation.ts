import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStoredMessage } from "./assistantHistory";
import type {
  AssistantConversationDetail,
  AssistantConversationPort,
  AssistantConversationSummary,
  PersistedAssistantMessage,
} from "../types/assistant";
import type { Database } from "../types/database.types";

export class SupabaseAssistantConversationAdapter implements AssistantConversationPort {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(projectId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary[]> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let query = this.client
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (options?.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async load(projectId: string, conversationId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let convQuery = this.client
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("id", conversationId)
      .eq("project_id", projectId);
    if (options?.signal) convQuery = convQuery.abortSignal(options.signal);
    const { data: convData, error: convError } = await convQuery.maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!convData) return null;

    // Load the LAST 100 messages: order by created_at DESC with limit 100, then reverse to chronological order
    let msgQuery = this.client
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (options?.signal) msgQuery = msgQuery.abortSignal(options.signal);
    const { data: msgData, error: msgError } = await msgQuery;
    if (msgError) throw new Error(msgError.message);

    const messages = (msgData ?? []).reverse().map(parseStoredMessage);
    return {
      conversationId: convData.id,
      title: convData.title,
      projectId: convData.project_id,
      createdAt: convData.created_at,
      updatedAt: convData.updated_at,
      messages,
    };
  }

  async rename(projectId: string, conversationId: string, title: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!cleanTitle) throw new Error("Conversation title cannot be empty.");
    let query = this.client
      .from("conversations")
      .update({ title: cleanTitle, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("project_id", projectId)
      .select("id, project_id, title, created_at, updated_at");
    if (options?.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query.single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      projectId: data.project_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async delete(projectId: string, conversationId: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let query = this.client
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("project_id", projectId);
    if (options?.signal) query = query.abortSignal(options.signal);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }

}

export interface InMemoryConversationData {
  summary: AssistantConversationSummary;
  messages: PersistedAssistantMessage[];
}

export class InMemoryAssistantConversationAdapter implements AssistantConversationPort {
  private conversations: Map<string, InMemoryConversationData> = new Map();

  constructor(initialData?: InMemoryConversationData[]) {
    if (initialData) {
      for (const item of initialData) {
        this.conversations.set(item.summary.id, {
          summary: { ...item.summary },
          messages: [...item.messages],
        });
      }
    }
  }

  async list(projectId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary[]> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    return Array.from(this.conversations.values())
      .filter((c) => c.summary.projectId === projectId)
      .map((c) => ({ ...c.summary }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50);
  }

  async load(projectId: string, conversationId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const found = this.conversations.get(conversationId);
    if (!found || found.summary.projectId !== projectId) return null;
    const last100 = found.messages.slice(-100);
    return {
      conversationId: found.summary.id,
      title: found.summary.title,
      projectId: found.summary.projectId,
      createdAt: found.summary.createdAt,
      updatedAt: found.summary.updatedAt,
      messages: [...last100],
    };
  }

  async rename(projectId: string, conversationId: string, title: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const found = this.conversations.get(conversationId);
    if (!found || found.summary.projectId !== projectId) throw new Error("Conversation not found.");
    const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!cleanTitle) throw new Error("Conversation title cannot be empty.");
    found.summary.title = cleanTitle;
    found.summary.updatedAt = new Date().toISOString();
    return { ...found.summary };
  }

  async delete(projectId: string, conversationId: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const found = this.conversations.get(conversationId);
    if (found?.summary.projectId === projectId) this.conversations.delete(conversationId);
  }

  addMessage(conversationId: string, message: PersistedAssistantMessage): void {
    const found = this.conversations.get(conversationId);
    if (found) {
      found.messages.push(message);
      found.summary.updatedAt = message.createdAt || new Date().toISOString();
    }
  }
}
