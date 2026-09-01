import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseProjectDataAdapter } from "../../src/data/supabaseProjectDataAdapter";
import type { Database } from "../../src/types/database.types";
import type { ProjectEventDraft } from "../../src/types/projects";

/**
 * Simulates the PostgreSQL RLS Engine for BioFold 3D schema:
 * - projects: owner_id = auth.uid()
 * - project_events: project owner_id = auth.uid()
 * - messages: sender = 'user' AND conversation owner_id = auth.uid() for INSERT
 * - ai_requests: user_id = auth.uid() for SELECT; INSERT/UPDATE/DELETE denied
 * - knowledge_sources & chunks: SELECT public; INSERT/UPDATE/DELETE denied
 */
function createRlsSimulatedSupabaseClient(currentUserId: string | null) {
  // Shared global DB state
  const db = {
    profiles: new Map<string, Database["public"]["Tables"]["profiles"]["Row"]>([
      ["user-a", { id: "user-a", display_name: "Alice", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }],
      ["user-b", { id: "user-b", display_name: "Bob", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }],
    ]),
    projects: new Map<string, Database["public"]["Tables"]["projects"]["Row"]>([
      [
        "project-a-1",
        {
          id: "project-a-1",
          owner_id: "user-a",
          title: "Alice's Project",
          description: "Private protein project",
          active_pdb_id: "1CRN",
          snapshot: {
            schemaVersion: 1,
            structure: { pdbId: "1CRN", source: "fixture" },
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 1,
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
      ],
    ]),
    project_events: new Map<string, Database["public"]["Tables"]["project_events"]["Row"][]>([
      [
        "project-a-1",
        [
          {
            id: "event-a-1",
            project_id: "project-a-1",
            activity_id: "act-1",
            command: "load_structure",
            origin: "human",
            agent_kind: null,
            approved_by_user: true,
            source_message_id: null,
            status: "success",
            evidence: "observed",
            provenance: { source: "fixture", structureId: "1CRN" },
            input: { pdbId: "1CRN" },
            output: { structureId: "1CRN" },
            error: null,
            duration_ms: 10,
            created_at: "2026-09-01T00:00:00Z",
          },
        ],
      ],
    ]),
    conversations: new Map<string, Database["public"]["Tables"]["conversations"]["Row"]>([
      [
        "conv-a-1",
        {
          id: "conv-a-1",
          project_id: "project-a-1",
          title: "Alice Chat",
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        },
      ],
    ]),
    messages: new Map<string, Database["public"]["Tables"]["messages"]["Row"]>(),
    ai_requests: new Map<string, Database["public"]["Tables"]["ai_requests"]["Row"]>(),
    knowledge_sources: new Map<string, Database["public"]["Tables"]["knowledge_sources"]["Row"]>([
      [
        "biofold-evidence-levels-v1",
        {
          id: "biofold-evidence-levels-v1",
          title: "Scientific evidence levels in BioFold",
          publisher: "BioFold",
          url: "https://github.com/JosueACondoriCh123/BioFold",
          license: "MIT",
          retrieved_at: "2026-09-01",
          content_path: "./evidence-levels.md",
          sha256: "5dfca4e25bdd95847fbce42f5e5e27cdbca1c35360e2f78609baf8f46b7be59d",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    ]),
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => {
        if (!currentUserId) {
          return { data: { user: null }, error: { message: "Not authenticated", status: 401 } };
        }
        return { data: { user: { id: currentUserId, email: `${currentUserId}@example.com` } }, error: null };
      }),
    },
    from: vi.fn((table: string) => {
      // 1. Projects Table RLS
      if (table === "projects") {
        return {
          select: vi.fn(() => {
            const filters: Array<(row: any) => boolean> = [];
            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                filters.push((row: any) => row[col] === val);
                return builder;
              }),
              order: vi.fn(() => builder),
              abortSignal: vi.fn(() => builder),
              maybeSingle: vi.fn(async () => {
                if (!currentUserId) return { data: null, error: { code: "42501", message: "RLS denied" } };
                const visible = [...db.projects.values()].filter(
                  (p) => p.owner_id === currentUserId && filters.every((f) => f(p)),
                );
                return { data: visible[0] ?? null, error: null };
              }),
              then: (resolve: any) => {
                if (!currentUserId) return resolve({ data: null, error: { code: "42501", message: "RLS denied" } });
                const visible = [...db.projects.values()].filter(
                  (p) => p.owner_id === currentUserId && filters.every((f) => f(p)),
                );
                return resolve({ data: visible, error: null });
              },
            };
            return builder;
          }),
          insert: vi.fn((data: any) => {
            const builder: any = {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  if (!currentUserId || data.owner_id !== currentUserId) {
                    return { data: null, error: { code: "42501", message: "RLS policy check failed" } };
                  }
                  const id = data.id ?? `proj-${Date.now()}`;
                  const row: Database["public"]["Tables"]["projects"]["Row"] = {
                    id,
                    owner_id: data.owner_id,
                    title: data.title,
                    description: data.description ?? "",
                    active_pdb_id: data.active_pdb_id ?? null,
                    snapshot: data.snapshot,
                    revision: 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  db.projects.set(id, row);
                  return { data: row, error: null };
                }),
              })),
            };
            return builder;
          }),
          update: vi.fn((data: any) => {
            const filters: Array<(row: any) => boolean> = [];
            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                filters.push((row: any) => row[col] === val);
                return builder;
              }),
              abortSignal: vi.fn(() => builder),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (!currentUserId) return { data: null, error: { code: "42501", message: "RLS denied" } };
                  const target = [...db.projects.values()].find(
                    (p) => p.owner_id === currentUserId && filters.every((f) => f(p)),
                  );
                  if (!target) return { data: null, error: null };
                  const updated = { ...target, ...data, updated_at: new Date().toISOString() };
                  db.projects.set(target.id, updated);
                  return { data: updated, error: null };
                }),
              })),
            };
            return builder;
          }),
          delete: vi.fn(() => {
            const filters: Array<(row: any) => boolean> = [];
            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                filters.push((row: any) => row[col] === val);
                return builder;
              }),
              abortSignal: vi.fn(() => builder),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (!currentUserId) return { data: null, error: { code: "42501", message: "RLS denied" } };
                  const target = [...db.projects.values()].find(
                    (p) => p.owner_id === currentUserId && filters.every((f) => f(p)),
                  );
                  if (!target) return { data: null, error: null };
                  db.projects.delete(target.id);
                  return { data: { id: target.id }, error: null };
                }),
              })),
            };
            return builder;
          }),
        };
      }

      // 2. Project Events Table RLS
      if (table === "project_events") {
        return {
          select: vi.fn(() => {
            const filters: Array<(row: any) => boolean> = [];
            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                filters.push((row: any) => row[col] === val);
                return builder;
              }),
              order: vi.fn(() => builder),
              abortSignal: vi.fn(() => builder),
              then: (resolve: any) => {
                if (!currentUserId) return resolve({ data: null, error: { code: "42501", message: "RLS denied" } });
                const visibleProjectIds = new Set(
                  [...db.projects.values()].filter((p) => p.owner_id === currentUserId).map((p) => p.id),
                );
                const events: any[] = [];
                for (const [projId, list] of db.project_events.entries()) {
                  if (visibleProjectIds.has(projId)) {
                    events.push(...list.filter((e) => filters.every((f) => f(e))));
                  }
                }
                return resolve({ data: events, error: null });
              },
            };
            return builder;
          }),
          insert: vi.fn((data: any) => {
            const builder: any = {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  if (!currentUserId) {
                    return { data: null, error: { code: "42501", message: "RLS denied" } };
                  }
                  const project = db.projects.get(data.project_id);
                  if (!project || project.owner_id !== currentUserId) {
                    return { data: null, error: { code: "42501", message: "RLS check failed: cannot append to another user's project" } };
                  }
                  const id = data.id ?? `event-${Date.now()}`;
                  const row = { ...data, id, created_at: new Date().toISOString() };
                  const list = db.project_events.get(data.project_id) ?? [];
                  list.unshift(row);
                  db.project_events.set(data.project_id, list);
                  return { data: row, error: null };
                }),
              })),
            };
            return builder;
          }),
        };
      }

      // 3. Messages Table RLS (User can ONLY insert sender = 'user')
      if (table === "messages") {
        return {
          insert: vi.fn((data: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (!currentUserId) return { data: null, error: { code: "42501", message: "RLS denied" } };
                if (data.sender !== "user") {
                  return {
                    data: null,
                    error: {
                      code: "42501",
                      message: "RLS policy check failed: browser clients cannot insert AI-generated or system messages directly",
                    },
                  };
                }
                const conv = db.conversations.get(data.conversation_id);
                if (!conv) return { data: null, error: { code: "42501", message: "Conversation not found or RLS denied" } };
                const project = db.projects.get(conv.project_id);
                if (!project || project.owner_id !== currentUserId) {
                  return { data: null, error: { code: "42501", message: "RLS denied" } };
                }
                const row = { ...data, id: `msg-${Date.now()}`, created_at: new Date().toISOString() };
                db.messages.set(row.id, row);
                return { data: row, error: null };
              }),
            })),
          })),
        };
      }

      // 4. AI Requests Table RLS (Direct client insert prohibited)
      if (table === "ai_requests") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                return {
                  data: null,
                  error: {
                    code: "42501",
                    message: "RLS policy check failed: direct client insert to ai_requests is prohibited",
                  },
                };
              }),
            })),
          })),
        };
      }

      // 5. Knowledge Corpus RLS (Direct client insert prohibited)
      if (table === "knowledge_sources" || table === "knowledge_chunks") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                return {
                  data: null,
                  error: {
                    code: "42501",
                    message: `RLS policy check failed: direct client write to ${table} is prohibited`,
                  },
                };
              }),
            })),
          })),
          select: vi.fn(() => ({
            then: (resolve: any) => resolve({ data: [...db.knowledge_sources.values()], error: null }),
          })),
        };
      }

      return {} as any;
    }),
  } as unknown as SupabaseClient<Database>;

  return { client, db };
}

describe("Phase 2 Multi-User RLS & Isolation", () => {
  it("User A can access and manage their own project", async () => {
    const { client } = createRlsSimulatedSupabaseClient("user-a");
    const adapter = new SupabaseProjectDataAdapter(client);

    const listRes = await adapter.listProjects();
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect(listRes.data.length).toBe(1);
      expect(listRes.data[0].id).toBe("project-a-1");
    }

    const getRes = await adapter.getProject("project-a-1");
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.data.ownerId).toBe("user-a");
    }
  });

  it("User B is strictly isolated from User A's projects (returns NOT_FOUND)", async () => {
    const { client } = createRlsSimulatedSupabaseClient("user-b");
    const adapter = new SupabaseProjectDataAdapter(client);

    // User B lists projects -> empty list
    const listRes = await adapter.listProjects();
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect(listRes.data.length).toBe(0);
    }

    // User B attempts to get User A's project -> NOT_FOUND
    const getRes = await adapter.getProject("project-a-1");
    expect(getRes.ok).toBe(false);
    if (!getRes.ok) {
      expect(getRes.error.code).toBe("NOT_FOUND");
    }

    // User B attempts to update User A's project -> NOT_FOUND
    const updateRes = await adapter.updateProject({
      projectId: "project-a-1",
      expectedRevision: 1,
      title: "Hacked by User B",
      description: "Exploit attempt",
    });
    expect(updateRes.ok).toBe(false);
    if (!updateRes.ok) {
      expect(updateRes.error.code).toBe("NOT_FOUND");
    }

    // User B attempts to append events to User A's project -> NOT_FOUND
    const eventDraft: ProjectEventDraft = {
      activityId: "act-b",
      command: "load_structure",
      origin: "agent",
      status: "success",
      evidence: "observed",
      input: { pdbId: "4HHB" },
      durationMs: 5,
      createdAt: new Date().toISOString(),
    };
    const appendRes = await adapter.appendEvent("project-a-1", eventDraft);
    expect(appendRes.ok).toBe(false);
    if (!appendRes.ok) {
      expect(appendRes.error.code).toBe("NOT_FOUND");
    }

    // User B attempts to delete User A's project -> NOT_FOUND
    const deleteRes = await adapter.deleteProject("project-a-1");
    expect(deleteRes.ok).toBe(false);
    if (!deleteRes.ok) {
      expect(deleteRes.error.code).toBe("NOT_FOUND");
    }
  });

  it("Anonymous client cannot access or mutate private projects", async () => {
    const { client } = createRlsSimulatedSupabaseClient(null);
    const adapter = new SupabaseProjectDataAdapter(client);

    const listRes = await adapter.listProjects();
    expect(listRes.ok).toBe(false);
    if (!listRes.ok) {
      expect(listRes.error.code).toBe("AUTH_REQUIRED");
    }

    const createRes = await adapter.createProject({ title: "Anon Project" });
    expect(createRes.ok).toBe(false);
    if (!createRes.ok) {
      expect(createRes.error.code).toBe("AUTH_REQUIRED");
    }
  });

  it("Direct browser client writes to AI messages, consumption, and corpus are blocked", async () => {
    const { client } = createRlsSimulatedSupabaseClient("user-a");

    // 1. Direct insert of assistant message from client fails RLS
    const { error: msgError } = await client
      .from("messages")
      .insert({
        conversation_id: "conv-a-1",
        sender: "assistant", // Prohibited from browser
        content: "I am an unauthorized direct AI message",
      })
      .select("*")
      .single();

    expect(msgError).not.toBeNull();
    expect(msgError?.message).toContain("browser clients cannot insert AI-generated or system messages");

    // 2. Direct insert of user message from client succeeds
    const { data: validMsg, error: userMsgError } = await client
      .from("messages")
      .insert({
        conversation_id: "conv-a-1",
        sender: "user", // Allowed
        content: "Hello assistant!",
      })
      .select("*")
      .single();

    expect(userMsgError).toBeNull();
    expect(validMsg?.sender).toBe("user");

    // 3. Direct insert to ai_requests from client fails RLS
    const { error: aiError } = await client
      .from("ai_requests")
      .insert({
        project_id: "project-a-1",
        user_id: "user-a",
        request_id: "req-unauth-1",
        model: "gpt-fake",
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      })
      .select("*")
      .single();

    expect(aiError).not.toBeNull();
    expect(aiError?.message).toContain("direct client insert to ai_requests is prohibited");

    // 4. Direct insert to knowledge_sources from client fails RLS
    const { error: corpusError } = await client
      .from("knowledge_sources")
      .insert({
        id: "malicious-source",
        title: "Malicious source",
        publisher: "BioFold",
        url: "https://example.com",
        license: "MIT",
        retrieved_at: "2026-09-01",
        sha256: "fake-sha",
      })
      .select("*")
      .single();

    expect(corpusError).not.toBeNull();
    expect(corpusError?.message).toContain("direct client write to knowledge_sources is prohibited");
  });
});
