import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import {
  createEmptyWorkspaceSnapshot,
  parseWorkspaceSnapshot,
} from "../types/projects";
import type {
  CreateProjectInput,
  ProjectDataError,
  ProjectDataErrorCode,
  ProjectDataPort,
  ProjectDataResult,
  ProjectEventDraft,
  ProjectEventRecord,
  ProjectRecord,
  ProjectRequestOptions,
  ProjectSummary,
  SaveProjectSnapshotInput,
  UpdateProjectInput,
  WorkspaceSnapshotV1,
} from "../types/projects";

type DbProject = Database["public"]["Tables"]["projects"]["Row"];
type DbProjectEvent = Database["public"]["Tables"]["project_events"]["Row"];

function cancelled<T>(): ProjectDataResult<T> {
  return {
    ok: false,
    error: {
      code: "CANCELLED",
      message: "The request was cancelled.",
      retryable: true,
    },
  };
}

function errorResult<T>(
  code: ProjectDataErrorCode,
  message: string,
  retryable = false,
  currentRevision?: number,
): ProjectDataResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      ...(currentRevision !== undefined ? { currentRevision } : {}),
    },
  };
}

function validateTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized || normalized.length > 120) {
    throw new Error("Project title must contain 1–120 characters.");
  }
  return normalized;
}

function validateDescription(description?: string): string {
  const normalized = description?.trim() ?? "";
  if (normalized.length > 1000) {
    throw new Error("Project description must not exceed 1,000 characters.");
  }
  return normalized;
}

function mapDbProjectToRecord(row: DbProject): ProjectRecord {
  let snapshot: WorkspaceSnapshotV1;
  try {
    snapshot = parseWorkspaceSnapshot(row.snapshot);
  } catch {
    snapshot = createEmptyWorkspaceSnapshot(row.active_pdb_id ?? undefined);
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    activePdbId: row.active_pdb_id,
    snapshot,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbProjectToSummary(row: Pick<
  DbProject,
  "id" | "title" | "description" | "active_pdb_id" | "revision" | "created_at" | "updated_at"
>): ProjectSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    activePdbId: row.active_pdb_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDbEventToRecord(row: DbProjectEvent): ProjectEventRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    activityId: row.activity_id,
    command: row.command as ProjectEventRecord["command"],
    origin: row.origin as ProjectEventRecord["origin"],
    ...(row.agent_kind ? { agentKind: row.agent_kind as "webmcp" | "assistant" } : {}),
    ...(row.approved_by_user !== null ? { approvedByUser: row.approved_by_user } : {}),
    ...(row.source_message_id ? { sourceMessageId: row.source_message_id } : {}),
    status: row.status as ProjectEventRecord["status"],
    evidence: row.evidence as ProjectEventRecord["evidence"],
    ...(row.provenance ? { provenance: row.provenance as unknown as ProjectEventRecord["provenance"] } : {}),
    input: row.input as unknown as ProjectEventRecord["input"],
    ...(row.output ? { output: row.output as unknown as ProjectEventRecord["output"] } : {}),
    ...(row.error ? { error: row.error as unknown as ProjectEventRecord["error"] } : {}),
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  } as ProjectEventRecord;
}

function mapPostgrestError(error: { code?: string; message?: string; details?: string }): ProjectDataError {
  const message = error.message ?? "Database operation failed.";
  if (error.code === "PGRST116" || error.code === "404") {
    return { code: "NOT_FOUND", message: "Project not found.", retryable: false };
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return { code: "AUTH_REQUIRED", message: "Authentication required or insufficient permissions.", retryable: false };
  }
  if (error.code === "23505" || error.code === "409") {
    return { code: "CONFLICT", message: "A conflict occurred with existing data.", retryable: false };
  }
  if (error.code === "23514" || error.code === "22001" || error.code === "22P02") {
    return { code: "INVALID_INPUT", message, retryable: false };
  }
  return { code: "UNKNOWN_ERROR", message, retryable: false };
}

export class SupabaseProjectDataAdapter implements ProjectDataPort {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private checkAbort<T>(options?: ProjectRequestOptions): ProjectDataResult<T> | null {
    if (options?.signal?.aborted) {
      return cancelled<T>();
    }
    return null;
  }

  async listProjects(options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectSummary[]>> {
    const aborted = this.checkAbort<ProjectSummary[]>(options);
    if (aborted) return aborted;

    try {
      let query = this.client
        .from("projects")
        .select("id, title, description, active_pdb_id, revision, created_at, updated_at")
        .order("updated_at", { ascending: false });

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query;
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectSummary[]>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      const summaries = (data ?? []).map(mapDbProjectToSummary);
      return { ok: true, data: summaries };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectSummary[]>();
      return errorResult<ProjectSummary[]>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to list projects.",
        true,
      );
    }
  }

  async getProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const aborted = this.checkAbort<ProjectRecord>(options);
    if (aborted) return aborted;

    if (!projectId || typeof projectId !== "string") {
      return errorResult<ProjectRecord>("INVALID_INPUT", "A valid project ID is required.");
    }

    try {
      let query = this.client
        .from("projects")
        .select("*")
        .eq("id", projectId);

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectRecord>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      if (!data) {
        return errorResult<ProjectRecord>("NOT_FOUND", "Project not found.");
      }

      return { ok: true, data: mapDbProjectToRecord(data) };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectRecord>();
      return errorResult<ProjectRecord>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to retrieve project.",
        true,
      );
    }
  }

  async createProject(input: CreateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const aborted = this.checkAbort<ProjectRecord>(options);
    if (aborted) return aborted;

    let title: string;
    let description: string;
    let snapshot: WorkspaceSnapshotV1;

    try {
      title = validateTitle(input.title);
      description = validateDescription(input.description);
      snapshot = input.snapshot
        ? parseWorkspaceSnapshot(input.snapshot)
        : createEmptyWorkspaceSnapshot();
    } catch (error) {
      return errorResult<ProjectRecord>(
        "INVALID_INPUT",
        error instanceof Error ? error.message : "Project input is invalid.",
      );
    }

    try {
      const { data: userData, error: userError } = await this.client.auth.getUser();
      if (userError || !userData?.user?.id) {
        return errorResult<ProjectRecord>("AUTH_REQUIRED", "Sign in before creating a project.");
      }

      const ownerId = userData.user.id;
      const activePdbId = snapshot.structure?.pdbId ?? null;

      let query = this.client
        .from("projects")
        .insert({
          owner_id: ownerId,
          title,
          description,
          active_pdb_id: activePdbId,
          snapshot: snapshot as unknown as Json,
          revision: 1,
        })
        .select("*");

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.single();
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectRecord>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      return { ok: true, data: mapDbProjectToRecord(data) };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectRecord>();
      return errorResult<ProjectRecord>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to create project.",
        true,
      );
    }
  }

  async updateProject(input: UpdateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const aborted = this.checkAbort<ProjectRecord>(options);
    if (aborted) return aborted;

    let title: string;
    let description: string;

    try {
      title = validateTitle(input.title);
      description = validateDescription(input.description);
    } catch (error) {
      return errorResult<ProjectRecord>(
        "INVALID_INPUT",
        error instanceof Error ? error.message : "Project input is invalid.",
      );
    }

    try {
      // 1. Fetch current revision
      const currentRes = await this.getProject(input.projectId, options);
      if (!currentRes.ok) return currentRes;
      const current = currentRes.data;

      if (current.revision !== input.expectedRevision) {
        return errorResult<ProjectRecord>(
          "CONFLICT",
          "This project was updated in another session.",
          false,
          current.revision,
        );
      }

      // 2. Perform optimistic conditional update
      const nextRevision = current.revision + 1;
      let query = this.client
        .from("projects")
        .update({
          title,
          description,
          revision: nextRevision,
        })
        .eq("id", input.projectId)
        .eq("revision", input.expectedRevision)
        .select("*");

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectRecord>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      if (!data) {
        // Revision changed concurrently
        const latest = await this.getProject(input.projectId);
        const currentRev = latest.ok ? latest.data.revision : undefined;
        return errorResult<ProjectRecord>(
          "CONFLICT",
          "This project was updated in another session.",
          false,
          currentRev,
        );
      }

      return { ok: true, data: mapDbProjectToRecord(data) };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectRecord>();
      return errorResult<ProjectRecord>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to update project.",
        true,
      );
    }
  }

  async saveSnapshot(input: SaveProjectSnapshotInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const aborted = this.checkAbort<ProjectRecord>(options);
    if (aborted) return aborted;

    let snapshot: WorkspaceSnapshotV1;
    try {
      snapshot = parseWorkspaceSnapshot(input.snapshot);
    } catch (error) {
      return errorResult<ProjectRecord>(
        "INVALID_INPUT",
        error instanceof Error ? error.message : "Workspace snapshot is invalid.",
      );
    }

    try {
      // 1. Fetch current revision
      const currentRes = await this.getProject(input.projectId, options);
      if (!currentRes.ok) return currentRes;
      const current = currentRes.data;

      if (current.revision !== input.expectedRevision) {
        return errorResult<ProjectRecord>(
          "CONFLICT",
          "This project was updated in another session.",
          false,
          current.revision,
        );
      }

      // 2. Perform optimistic conditional update
      const nextRevision = current.revision + 1;
      const activePdbId = snapshot.structure?.pdbId ?? null;

      let query = this.client
        .from("projects")
        .update({
          snapshot: snapshot as unknown as Json,
          active_pdb_id: activePdbId,
          revision: nextRevision,
        })
        .eq("id", input.projectId)
        .eq("revision", input.expectedRevision)
        .select("*");

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectRecord>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      if (!data) {
        const latest = await this.getProject(input.projectId);
        const currentRev = latest.ok ? latest.data.revision : undefined;
        return errorResult<ProjectRecord>(
          "CONFLICT",
          "This project was updated in another session.",
          false,
          currentRev,
        );
      }

      return { ok: true, data: mapDbProjectToRecord(data) };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectRecord>();
      return errorResult<ProjectRecord>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to save project snapshot.",
        true,
      );
    }
  }

  async deleteProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<{ projectId: string }>> {
    const aborted = this.checkAbort<{ projectId: string }>(options);
    if (aborted) return aborted;

    if (!projectId || typeof projectId !== "string") {
      return errorResult<{ projectId: string }>("INVALID_INPUT", "A valid project ID is required.");
    }

    try {
      let query = this.client
        .from("projects")
        .delete()
        .eq("id", projectId)
        .select("id");

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        if (options?.signal?.aborted) return cancelled<{ projectId: string }>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      if (!data) {
        return errorResult<{ projectId: string }>("NOT_FOUND", "Project not found.");
      }

      return { ok: true, data: { projectId } };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<{ projectId: string }>();
      return errorResult<{ projectId: string }>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to delete project.",
        true,
      );
    }
  }

  async listEvents(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord[]>> {
    const aborted = this.checkAbort<ProjectEventRecord[]>(options);
    if (aborted) return aborted;

    if (!projectId || typeof projectId !== "string") {
      return errorResult<ProjectEventRecord[]>("INVALID_INPUT", "A valid project ID is required.");
    }

    try {
      // Verify project accessibility first
      const projectCheck = await this.getProject(projectId, options);
      if (!projectCheck.ok) {
        return errorResult<ProjectEventRecord[]>(projectCheck.error.code, projectCheck.error.message);
      }

      let query = this.client
        .from("project_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query;
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectEventRecord[]>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      const events = (data ?? []).map(mapDbEventToRecord);
      return { ok: true, data: events };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectEventRecord[]>();
      return errorResult<ProjectEventRecord[]>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to list project events.",
        true,
      );
    }
  }

  async appendEvent(projectId: string, event: ProjectEventDraft, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord>> {
    const aborted = this.checkAbort<ProjectEventRecord>(options);
    if (aborted) return aborted;

    if (!projectId || typeof projectId !== "string") {
      return errorResult<ProjectEventRecord>("INVALID_INPUT", "A valid project ID is required.");
    }

    try {
      // Verify project accessibility first
      const projectCheck = await this.getProject(projectId, options);
      if (!projectCheck.ok) {
        return errorResult<ProjectEventRecord>(projectCheck.error.code, projectCheck.error.message);
      }

      let query = this.client
        .from("project_events")
        .insert({
          project_id: projectId,
          activity_id: event.activityId,
          command: event.command,
          origin: event.origin,
          agent_kind: event.agentKind ?? null,
          approved_by_user: event.approvedByUser ?? false,
          source_message_id: event.sourceMessageId ?? null,
          status: event.status,
          evidence: event.evidence,
          provenance: (event.provenance ?? null) as unknown as Json,
          input: (event.input ?? {}) as unknown as Json,
          output: (event.output ?? null) as unknown as Json,
          error: (event.error ?? null) as unknown as Json,
          duration_ms: event.durationMs ?? 0,
        })
        .select("*");

      if (options?.signal) {
        query = query.abortSignal(options.signal);
      }

      const { data, error } = await query.single();
      if (error) {
        if (options?.signal?.aborted) return cancelled<ProjectEventRecord>();
        return { ok: false, error: mapPostgrestError(error) };
      }

      return { ok: true, data: mapDbEventToRecord(data) };
    } catch (err) {
      if (options?.signal?.aborted) return cancelled<ProjectEventRecord>();
      return errorResult<ProjectEventRecord>(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Failed to append project event.",
        true,
      );
    }
  }
}
