import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAssistantConversationAdapter,
  SupabaseAssistantConversationAdapter,
} from "../src/assistant/assistantConversation";
import { generateUuid, isValidUuid } from "../src/assistant/uuid";
import type { PersistedAssistantMessage } from "../src/types/assistant";

describe("UUID utilities", () => {
  it("generates distinct RFC 4122 v4 UUIDs", () => {
    const first = generateUuid();
    const second = generateUuid();
    expect(isValidUuid(first)).toBe(true);
    expect(isValidUuid(second)).toBe(true);
    expect(second).not.toBe(first);
  });
});

describe("InMemoryAssistantConversationAdapter", () => {
  it("lists, loads, renames and deletes within a project boundary", async () => {
    const projectId = "project-a";
    const conversationId = "conversation-a";
    const messages: PersistedAssistantMessage[] = Array.from({ length: 120 }, (_, index) => ({
      id: `message-${index + 1}`,
      sender: index % 2 ? "assistant" as const : "user" as const,
      content: `Message ${index + 1}`,
      citations: [],
      proposals: [],
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    }));
    const adapter = new InMemoryAssistantConversationAdapter([{
      summary: {
        id: conversationId, projectId, title: "Original",
        createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:02:00Z",
      },
      messages,
    }]);

    expect(await adapter.list(projectId)).toHaveLength(1);
    expect(await adapter.load("project-b", conversationId)).toBeNull();
    const detail = await adapter.load(projectId, conversationId);
    expect(detail?.messages).toHaveLength(100);
    expect(detail?.messages[0].content).toBe("Message 21");
    expect(detail?.messages[99].content).toBe("Message 120");

    const renamed = await adapter.rename(projectId, conversationId, "  Renamed title  ");
    expect(renamed.title).toBe("Renamed title");
    await adapter.delete("project-b", conversationId);
    expect(await adapter.list(projectId)).toHaveLength(1);
    await adapter.delete(projectId, conversationId);
    expect(await adapter.list(projectId)).toHaveLength(0);
  });

  it("returns at most 50 conversations ordered by activity", async () => {
    const adapter = new InMemoryAssistantConversationAdapter(Array.from({ length: 55 }, (_, index) => ({
      summary: {
        id: `conversation-${index}`, projectId: "project", title: `Conversation ${index}`,
        createdAt: new Date(index * 1000).toISOString(), updatedAt: new Date(index * 1000).toISOString(),
      },
      messages: [],
    })));
    const list = await adapter.list("project");
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe("conversation-54");
  });
});

describe("SupabaseAssistantConversationAdapter", () => {
  it("limits the activity-ordered list to 50", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: "c1", project_id: "p1", title: "Conv 1", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T01:00:00Z" }],
      error: null,
    });
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    const adapter = new SupabaseAssistantConversationAdapter({ from: vi.fn().mockReturnValue(chain) } as never);
    expect((await adapter.list("p1"))[0].id).toBe("c1");
    expect(chain.eq).toHaveBeenCalledWith("project_id", "p1");
    expect(chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it("loads the last 100 messages and reverses them chronologically", async () => {
    const conversation = {
      id: "c1", project_id: "p1", title: "Test", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T01:00:00Z",
    };
    const conversationChain: Record<string, ReturnType<typeof vi.fn>> = {};
    conversationChain.select = vi.fn(() => conversationChain);
    conversationChain.eq = vi.fn(() => conversationChain);
    conversationChain.maybeSingle = vi.fn().mockResolvedValue({ data: conversation, error: null });
    const messageChain: Record<string, ReturnType<typeof vi.fn>> = {};
    messageChain.select = vi.fn(() => messageChain);
    messageChain.eq = vi.fn(() => messageChain);
    messageChain.order = vi.fn(() => messageChain);
    messageChain.limit = vi.fn().mockResolvedValue({ data: [
      { id: "m2", sender: "assistant", content: "Second", citations: null, proposals: null, created_at: "2026-09-01T00:01:00Z" },
      { id: "m1", sender: "user", content: "First", citations: null, proposals: null, created_at: "2026-09-01T00:00:00Z" },
    ], error: null });
    const client = { from: vi.fn((table: string) => table === "conversations" ? conversationChain : messageChain) };
    const detail = await new SupabaseAssistantConversationAdapter(client as never).load("p1", "c1");
    expect(conversationChain.eq).toHaveBeenNthCalledWith(1, "id", "c1");
    expect(conversationChain.eq).toHaveBeenNthCalledWith(2, "project_id", "p1");
    expect(messageChain.limit).toHaveBeenCalledWith(100);
    expect(detail?.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});
