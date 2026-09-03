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
      .order("updated_at", { ascending: false });
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

  async get(conversationId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let convQuery = this.client
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("id", conversationId);
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

  async create(projectId: string, title = "New conversation", options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const cleanTitle = title.trim().slice(0, 120) || "New conversation";
    let query = this.client
      .from("conversations")
      .insert({ project_id: projectId, title: cleanTitle })
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

  async rename(conversationId: string, title: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const cleanTitle = title.trim().slice(0, 120);
    if (!cleanTitle) throw new Error("Conversation title cannot be empty.");
    let query = this.client
      .from("conversations")
      .update({ title: cleanTitle, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
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

  async delete(conversationId: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let query = this.client
      .from("conversations")
      .delete()
      .eq("id", conversationId);
    if (options?.signal) query = query.abortSignal(options.signal);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }

  async loadLatest(projectId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    let query = this.client
      .from("conversations")
      .select("id, project_id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (options?.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const latest = data?.[0];
    if (!latest) return null;
    return this.get(latest.id, options);
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
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async get(conversationId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const found = this.conversations.get(conversationId);
    if (!found) return null;
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

  async create(projectId: string, title = "New conversation", options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const id = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const now = new Date().toISOString();
    const cleanTitle = title.trim().slice(0, 120) || "New conversation";
    const summary: AssistantConversationSummary = {
      id,
      projectId,
      title: cleanTitle,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, { summary, messages: [] });
    return { ...summary };
  }

  async rename(conversationId: string, title: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationSummary> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const found = this.conversations.get(conversationId);
    if (!found) throw new Error("Conversation not found.");
    const cleanTitle = title.trim().slice(0, 120);
    if (!cleanTitle) throw new Error("Conversation title cannot be empty.");
    found.summary.title = cleanTitle;
    found.summary.updatedAt = new Date().toISOString();
    return { ...found.summary };
  }

  async delete(conversationId: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    this.conversations.delete(conversationId);
  }

  async loadLatest(projectId: string, options?: { signal?: AbortSignal }): Promise<AssistantConversationDetail | null> {
    if (options?.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const list = await this.list(projectId, options);
    if (list.length === 0) return null;
    return this.get(list[0].id, options);
  }

  addMessage(conversationId: string, message: PersistedAssistantMessage): void {
    const found = this.conversations.get(conversationId);
    if (found) {
      found.messages.push(message);
      found.summary.updatedAt = message.createdAt || new Date().toISOString();
    }
  }
}
