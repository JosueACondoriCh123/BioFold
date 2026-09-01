import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseProjectDataAdapter } from "../../src/data/supabaseProjectDataAdapter";
import type { Database } from "../../src/types/database.types";
import type {
  CreateProjectInput,
  ProjectEventDraft,
  SaveProjectSnapshotInput,
  UpdateProjectInput,
  WorkspaceSnapshotV1,
} from "../../src/types/projects";

function createMockSupabaseClient(config: {
  userId?: string | null;
  projects?: Array<Database["public"]["Tables"]["projects"]["Row"]>;
  events?: Array<Database["public"]["Tables"]["project_events"]["Row"]>;
}) {
  const currentUserId = config.userId === undefined ? "test-user-a" : config.userId;
  const projectsStore = new Map<string, Database["public"]["Tables"]["projects"]["Row"]>(
    (config.projects ?? []).map((p) => [p.id, { ...p }]),
  );
  const eventsStore = new Map<string, Database["public"]["Tables"]["project_events"]["Row"][]>();

  (config.events ?? []).forEach((e) => {
    const list = eventsStore.get(e.project_id) ?? [];
    list.push({ ...e });
    eventsStore.set(e.project_id, list);
  });

  let idCounter = 100;

  const client = {
    auth: {
      getUser: vi.fn(async () => {
        if (!currentUserId) {
          return { data: { user: null }, error: { message: "Not authenticated", status: 401 } };
        }
        return {
          data: {
            user: { id: currentUserId, email: "user@example.com" },
          },
          error: null,
        };
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn(() => {
            const queryState: {
              filters: Array<(row: Database["public"]["Tables"]["projects"]["Row"]) => boolean>;
              orderBy?: { column: string; ascending: boolean };
              aborted?: boolean;
            } = { filters: [] };

            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                queryState.filters.push((row: any) => row[col] === val);
                return builder;
              }),
              order: vi.fn((column: string, opts?: { ascending: boolean }) => {
                queryState.orderBy = { column, ascending: opts?.ascending ?? true };
                return builder;
              }),
              abortSignal: vi.fn((signal: AbortSignal) => {
                if (signal.aborted) queryState.aborted = true;
                return builder;
              }),
              maybeSingle: vi.fn(async () => {
                if (queryState.aborted) throw new Error("AbortError");
                const rows = [...projectsStore.values()].filter((p) =>
                  queryState.filters.every((f) => f(p)),
                );
                return { data: rows[0] ?? null, error: null };
              }),
              single: vi.fn(async () => {
                if (queryState.aborted) throw new Error("AbortError");
                const rows = [...projectsStore.values()].filter((p) =>
                  queryState.filters.every((f) => f(p)),
                );
                if (rows.length === 0) {
                  return { data: null, error: { code: "PGRST116", message: "Row not found" } };
                }
                return { data: rows[0], error: null };
              }),
              then: (resolve: any, reject: any) => {
                if (queryState.aborted) return reject(new Error("AbortError"));
                const rows = [...projectsStore.values()].filter((p) =>
                  queryState.filters.every((f) => f(p)),
                );
                if (queryState.orderBy) {
                  const { column, ascending } = queryState.orderBy;
                  rows.sort((a: any, b: any) => {
                    const cmp = String(a[column]).localeCompare(String(b[column]));
                    return ascending ? cmp : -cmp;
                  });
                }
                return resolve({ data: rows, error: null });
              },
            };
            return builder;
          }),
          insert: vi.fn((data: any) => {
            const builder: any = {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const id = data.id ?? `project-uuid-${idCounter++}`;
                  const now = new Date().toISOString();
                  const row: Database["public"]["Tables"]["projects"]["Row"] = {
                    id,
                    owner_id: data.owner_id,
                    title: data.title,
                    description: data.description ?? "",
                    active_pdb_id: data.active_pdb_id ?? null,
                    snapshot: data.snapshot,
                    revision: data.revision ?? 1,
                    created_at: now,
                    updated_at: now,
                  };
                  projectsStore.set(id, row);
                  eventsStore.set(id, []);
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
                  const matching = [...projectsStore.values()].find((p) =>
                    filters.every((f) => f(p)),
                  );
                  if (!matching) {
                    return { data: null, error: null };
                  }
                  const updated: Database["public"]["Tables"]["projects"]["Row"] = {
                    ...matching,
                    ...data,
                    updated_at: new Date().toISOString(),
                  };
                  projectsStore.set(matching.id, updated);
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
                  const matching = [...projectsStore.values()].find((p) =>
                    filters.every((f) => f(p)),
                  );
                  if (!matching) {
                    return { data: null, error: null };
                  }
                  projectsStore.delete(matching.id);
                  eventsStore.delete(matching.id);
                  return { data: { id: matching.id }, error: null };
                }),
              })),
            };
            return builder;
          }),
        };
      }

      if (table === "project_events") {
        return {
          select: vi.fn(() => {
            const filters: Array<(row: any) => boolean> = [];
            let orderDesc = true;
            const builder: any = {
              eq: vi.fn((col: string, val: any) => {
                filters.push((row: any) => row[col] === val);
                return builder;
              }),
              order: vi.fn((_col: string, opts?: { ascending: boolean }) => {
                orderDesc = !(opts?.ascending ?? true);
                return builder;
              }),
              abortSignal: vi.fn(() => builder),
              then: (resolve: any) => {
                const rows: any[] = [];
                for (const list of eventsStore.values()) {
                  rows.push(...list.filter((e) => filters.every((f) => f(e))));
                }
                rows.sort((a, b) =>
                  orderDesc
                    ? b.created_at.localeCompare(a.created_at)
                    : a.created_at.localeCompare(b.created_at),
                );
                return resolve({ data: rows, error: null });
              },
            };
            return builder;
          }),
          insert: vi.fn((data: any) => {
            const builder: any = {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const id = data.id ?? `event-uuid-${idCounter++}`;
                  const row: Database["public"]["Tables"]["project_events"]["Row"] = {
                    id,
                    project_id: data.project_id,
                    activity_id: data.activity_id,
                    command: data.command,
                    origin: data.origin,
                    agent_kind: data.agent_kind ?? null,
                    approved_by_user: data.approved_by_user ?? false,
                    source_message_id: data.source_message_id ?? null,
                    status: data.status,
                    evidence: data.evidence,
                    provenance: data.provenance ?? null,
                    input: data.input ?? {},
                    output: data.output ?? null,
                    error: data.error ?? null,
                    duration_ms: data.duration_ms ?? 0,
                    created_at: new Date().toISOString(),
                  };
                  const list = eventsStore.get(data.project_id) ?? [];
                  list.unshift(row);
                  eventsStore.set(data.project_id, list);
                  return { data: row, error: null };
                }),
              })),
            };
            return builder;
          }),
        };
      }

      return {} as any;
    }),
  } as unknown as SupabaseClient<Database>;

  return { client, projectsStore, eventsStore };
}

describe("SupabaseProjectDataAdapter", () => {
  it("creates a new project with default snapshot and revision 1", async () => {
    const { client } = createMockSupabaseClient({ userId: "user-123" });
    const adapter = new SupabaseProjectDataAdapter(client);

    const input: CreateProjectInput = {
      title: "Crambin Exploration",
      description: "Analyzing hydrophobicity in 1CRN",
    };

    const result = await adapter.createProject(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Crambin Exploration");
      expect(result.data.description).toBe("Analyzing hydrophobicity in 1CRN");
      expect(result.data.ownerId).toBe("user-123");
      expect(result.data.revision).toBe(1);
      expect(result.data.snapshot.schemaVersion).toBe(1);
    }
  });

  it("rejects project creation when title is empty or invalid", async () => {
    const { client } = createMockSupabaseClient({ userId: "user-123" });
    const adapter = new SupabaseProjectDataAdapter(client);

    const result = await adapter.createProject({ title: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("rejects project creation when user is not authenticated", async () => {
    const { client } = createMockSupabaseClient({ userId: null });
    const adapter = new SupabaseProjectDataAdapter(client);

    const result = await adapter.createProject({ title: "Valid Title" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_REQUIRED");
    }
  });

  it("lists projects ordered by updatedAt desc", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "Project Alpha",
          description: "Desc A",
          active_pdb_id: "1CRN",
          snapshot: { schemaVersion: 1 } as any,
          revision: 1,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
        {
          id: "p2",
          owner_id: "user-123",
          title: "Project Beta",
          description: "Desc B",
          active_pdb_id: "4HHB",
          snapshot: { schemaVersion: 1 } as any,
          revision: 2,
          created_at: "2026-09-01T02:00:00Z",
          updated_at: "2026-09-01T03:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const result = await adapter.listProjects();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(2);
      expect(result.data[0].id).toBe("p2");
      expect(result.data[1].id).toBe("p1");
    }
  });

  it("rejects a corrupt stored snapshot instead of silently replacing it", async () => {
    const { client } = createMockSupabaseClient({
      projects: [{
        id: "p-corrupt",
        owner_id: "test-user-a",
        title: "Corrupt project",
        description: "",
        active_pdb_id: "1CRN",
        snapshot: { schemaVersion: 999 },
        revision: 1,
        created_at: "2026-09-01T01:00:00Z",
        updated_at: "2026-09-01T01:00:00Z",
      }],
    });

    const result = await new SupabaseProjectDataAdapter(client).getProject("p-corrupt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_ERROR");
      expect(result.error.message).toContain("not restored");
    }
  });

  it("updates project metadata and increments revision", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "Initial Title",
          description: "Initial Desc",
          active_pdb_id: "1CRN",
          snapshot: {
            schemaVersion: 1,
            structure: { pdbId: "1CRN", source: "fixture" },
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 1,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const updateInput: UpdateProjectInput = {
      projectId: "p1",
      expectedRevision: 1,
      title: "Updated Title",
      description: "Updated Desc",
    };

    const result = await adapter.updateProject(updateInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Updated Title");
      expect(result.data.description).toBe("Updated Desc");
      expect(result.data.revision).toBe(2);
    }
  });

  it("returns CONFLICT when expectedRevision does not match current revision", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "Project 1",
          description: "",
          active_pdb_id: null,
          snapshot: {
            schemaVersion: 1,
            structure: null,
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 3,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const updateInput: UpdateProjectInput = {
      projectId: "p1",
      expectedRevision: 1, // Stale revision
      title: "Stale Update",
      description: "",
    };

    const result = await adapter.updateProject(updateInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.currentRevision).toBe(3);
    }
  });

  it("saves a valid workspace snapshot and updates activePdbId", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "Project 1",
          description: "",
          active_pdb_id: null,
          snapshot: {
            schemaVersion: 1,
            structure: null,
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 1,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const snapshot: WorkspaceSnapshotV1 = {
      schemaVersion: 1,
      structure: { pdbId: "4HHB", source: "fixture" },
      view: { representation: "stick", colorScheme: "spectrum", camera: null },
      surface: { visible: true, opacity: 0.5 },
      selectedResidues: [{ chain: "A", residueNumber: 10 }],
    };

    const saveInput: SaveProjectSnapshotInput = {
      projectId: "p1",
      expectedRevision: 1,
      snapshot,
    };

    const result = await adapter.saveSnapshot(saveInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.activePdbId).toBe("4HHB");
      expect(result.data.revision).toBe(2);
      expect(result.data.snapshot.view.representation).toBe("stick");
    }
  });

  it("appends and lists project events with audit metadata", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "Project 1",
          description: "",
          active_pdb_id: "1CRN",
          snapshot: {
            schemaVersion: 1,
            structure: { pdbId: "1CRN", source: "fixture" },
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 1,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const eventDraft: ProjectEventDraft = {
      activityId: "act-1",
      command: "measure_distance",
      origin: "agent",
      agentKind: "webmcp",
      approvedByUser: true,
      status: "success",
      evidence: "calculated",
      input: {
        from: { chain: "A", residueNumber: 1, atomName: "CA" },
        to: { chain: "A", residueNumber: 10, atomName: "CA" },
      },
      output: {
        from: { chain: "A", residueNumber: 1, atomName: "CA" },
        to: { chain: "A", residueNumber: 10, atomName: "CA" },
        angstroms: 12.6,
        units: "angstrom",
        changedView: true,
      },
      durationMs: 4,
      createdAt: new Date().toISOString(),
    };

    const appendRes = await adapter.appendEvent("p1", eventDraft);
    expect(appendRes.ok).toBe(true);
    if (appendRes.ok) {
      expect(appendRes.data.command).toBe("measure_distance");
      expect(appendRes.data.evidence).toBe("calculated");
      expect(appendRes.data.projectId).toBe("p1");
    }

    const listRes = await adapter.listEvents("p1");
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect(listRes.data.length).toBe(1);
      expect(listRes.data[0].activityId).toBe("act-1");
    }
  });

  it("deletes a project and its records", async () => {
    const { client } = createMockSupabaseClient({
      userId: "user-123",
      projects: [
        {
          id: "p1",
          owner_id: "user-123",
          title: "To Delete",
          description: "",
          active_pdb_id: null,
          snapshot: {
            schemaVersion: 1,
            structure: null,
            view: { representation: "cartoon", colorScheme: "chain", camera: null },
            surface: { visible: false, opacity: 0.72 },
            selectedResidues: [],
          },
          revision: 1,
          created_at: "2026-09-01T01:00:00Z",
          updated_at: "2026-09-01T01:00:00Z",
        },
      ],
    });

    const adapter = new SupabaseProjectDataAdapter(client);
    const deleteRes = await adapter.deleteProject("p1");
    expect(deleteRes.ok).toBe(true);

    const getRes = await adapter.getProject("p1");
    expect(getRes.ok).toBe(false);
    if (!getRes.ok) {
      expect(getRes.error.code).toBe("NOT_FOUND");
    }
  });
});
