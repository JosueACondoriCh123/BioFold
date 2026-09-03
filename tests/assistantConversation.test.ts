import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAssistantConversationAdapter,
  SupabaseAssistantConversationAdapter,
} from "../src/assistant/assistantConversation";
import { generateUuid, isValidUuid } from "../src/assistant/uuid";
import type { PersistedAssistantMessage } from "../src/types/assistant";

describe("UUID utilities", () => {
  it("generates valid RFC 4122 v4 UUIDs", () => {
    const uuid1 = generateUuid();
    const uuid2 = generateUuid();
    expect(isValidUuid(uuid1)).toBe(true);
    expect(isValidUuid(uuid2)).toBe(true);
    expect(uuid1).not.toBe(uuid2);
  });

  it("validates UUIDs accurately", () => {
    expect(isValidUuid("c0a80101-0000-4000-8000-000000000001")).toBe(true);
    expect(isValidUuid("invalid-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });
});

describe("InMemoryAssistantConversationAdapter", () => {
  it("supports full CRUD and limits get to the last 100 messages", async () => {
    const adapter = new InMemoryAssistantConversationAdapter();
    const projectId = "proj-1";

    // 1. Create
    const created = await adapter.create(projectId, "First conversation");
    expect(created.title).toBe("First conversation");
    expect(created.projectId).toBe(projectId);

    // 2. List
    const list = await adapter.list(projectId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);

    // 3. Rename
    const renamed = await adapter.rename(created.id, "Renamed title");
    expect(renamed.title).toBe("Renamed title");

    // 4. Add 120 messages and verify load of last 100
    for (let i = 1; i <= 120; i++) {
      const msg: PersistedAssistantMessage = {
        id: "msg-" + i,
        sender: i % 2 === 1 ? "user" : "assistant",
        content: "Message " + i,
        citations: [],
        proposals: [],
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      };
      adapter.addMessage(created.id, msg);
    }

    const detail = await adapter.get(created.id);
    expect(detail).not.toBeNull();
    expect(detail!.messages).toHaveLength(100);
    // Earliest of the last 100 should be Message 21
    expect(detail!.messages[0].content).toBe("Message 21");
    // Latest should be Message 120
    expect(detail!.messages[99].content).toBe("Message 120");

    // 5. Load latest
    const latest = await adapter.loadLatest(projectId);
    expect(latest?.conversationId).toBe(created.id);

    // 6. Delete
    await adapter.delete(created.id);
    const listAfterDelete = await adapter.list(projectId);
    expect(listAfterDelete).toHaveLength(0);
  });
});

describe("SupabaseAssistantConversationAdapter", () => {
  it("queries conversations ordered by updated_at descending", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        { id: "c1", project_id: "p1", title: "Conv 1", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T01:00:00Z" },
      ],
      error: null,
    });

    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
      }),
    };

    const adapter = new SupabaseAssistantConversationAdapter(mockClient as any);
    const result = await adapter.list("p1");

    expect(mockClient.from).toHaveBeenCalledWith("conversations");
    expect(mockSelect).toHaveBeenCalledWith("id, project_id, title, created_at, updated_at");
    expect(mockEq).toHaveBeenCalledWith("project_id", "p1");
    expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("loads the last 100 messages ordered descending and reverses them into chronological order", async () => {
    const rawMessages = [
      { id: "m2", sender: "assistant", content: "Second message", citations: null, proposals: null, created_at: "2026-09-01T00:01:00Z" },
      { id: "m1", sender: "user", content: "First message", citations: null, proposals: null, created_at: "2026-09-01T00:00:00Z" },
    ];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "c1", project_id: "p1", title: "Test Conv", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T01:00:00Z" },
              error: null,
            }),
          };
        }
        if (table === "messages") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: rawMessages,
              error: null,
            }),
          };
        }
        throw new Error("Unexpected table: " + table);
      }),
    };

    const adapter = new SupabaseAssistantConversationAdapter(mockClient as any);
    const detail = await adapter.get("c1");

    expect(detail).not.toBeNull();
    expect(detail!.conversationId).toBe("c1");
    // Check that messages were reversed to chronological order (First message then Second message)
    expect(detail!.messages[0].id).toBe("m1");
    expect(detail!.messages[0].content).toBe("First message");
    expect(detail!.messages[1].id).toBe("m2");
    expect(detail!.messages[1].content).toBe("Second message");
  });

  it("creates a conversation with sanitized title", async () => {
    const mockInsert = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: "c-new", project_id: "p1", title: "Clean Title", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
      error: null,
    });

    const mockClient = {
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
      }),
    };

    const adapter = new SupabaseAssistantConversationAdapter(mockClient as any);
    const created = await adapter.create("p1", "  Clean Title  ");

    expect(mockInsert).toHaveBeenCalledWith({ project_id: "p1", title: "Clean Title" });
    expect(created.id).toBe("c-new");
    expect(created.title).toBe("Clean Title");
  });

  it("renames a conversation", async () => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: "c1", project_id: "p1", title: "Updated Title", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T02:00:00Z" },
      error: null,
    });

    const mockClient = {
      from: vi.fn().mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      }),
    };

    const adapter = new SupabaseAssistantConversationAdapter(mockClient as any);
    const renamed = await adapter.rename("c1", "Updated Title");

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: "Updated Title" }));
    expect(mockEq).toHaveBeenCalledWith("id", "c1");
    expect(renamed.title).toBe("Updated Title");
  });

  it("deletes a conversation", async () => {
    const mockDelete = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    const mockClient = {
      from: vi.fn().mockReturnValue({
        delete: mockDelete,
        eq: mockEq,
      }),
    };

    const adapter = new SupabaseAssistantConversationAdapter(mockClient as any);
    await adapter.delete("c1");

    expect(mockClient.from).toHaveBeenCalledWith("conversations");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "c1");
  });
});
