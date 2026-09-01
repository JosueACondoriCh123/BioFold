import { createEmptyWorkspaceSnapshot, parseWorkspaceSnapshot } from "../types/projects";
import type {
  CreateProjectInput,
  ProjectDataPort,
  ProjectDataResult,
  ProjectEventDraft,
  ProjectEventRecord,
  ProjectRecord,
  ProjectRequestOptions,
  ProjectSummary,
  SaveProjectSnapshotInput,
  UpdateProjectInput,
} from "../types/projects";

const clone = <T>(value: T): T => structuredClone(value);

function cancelled<T>(): ProjectDataResult<T> {
  return { ok: false, error: { code: "CANCELLED", message: "The request was cancelled.", retryable: true } };
}

function validateTitle(title: string) {
  const normalized = title.trim();
  if (!normalized || normalized.length > 120) throw new Error("Project title must contain 1–120 characters.");
  return normalized;
}

function toSummary(project: ProjectRecord): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    activePdbId: project.activePdbId,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Deterministic development adapter for external UI work and component tests. */
export class InMemoryProjectDataPort implements ProjectDataPort {
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly events = new Map<string, ProjectEventRecord[]>();
  private nextId = 1;

  constructor(
    private readonly ownerId = "phase2-test-user",
    private readonly now: () => Date = () => new Date(),
  ) {}

  private check<T>(options?: ProjectRequestOptions): ProjectDataResult<T> | null {
    return options?.signal?.aborted ? cancelled<T>() : null;
  }

  async listProjects(options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectSummary[]>> {
    const stopped = this.check<ProjectSummary[]>(options);
    if (stopped) return stopped;
    const projects = [...this.projects.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toSummary);
    return { ok: true, data: clone(projects) };
  }

  async getProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const stopped = this.check<ProjectRecord>(options);
    if (stopped) return stopped;
    const project = this.projects.get(projectId);
    return project
      ? { ok: true, data: clone(project) }
      : { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
  }

  async createProject(input: CreateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const stopped = this.check<ProjectRecord>(options);
    if (stopped) return stopped;
    try {
      const title = validateTitle(input.title);
      const description = input.description?.trim() ?? "";
      if (description.length > 1_000) throw new Error("Project description must not exceed 1,000 characters.");
      const snapshot = input.snapshot
        ? parseWorkspaceSnapshot(input.snapshot)
        : createEmptyWorkspaceSnapshot();
      const timestamp = this.now().toISOString();
      const id = `phase2-project-${this.nextId++}`;
      const project: ProjectRecord = {
        id,
        ownerId: this.ownerId,
        title,
        description,
        activePdbId: snapshot.structure?.pdbId ?? null,
        snapshot,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.projects.set(id, clone(project));
      this.events.set(id, []);
      return { ok: true, data: clone(project) };
    } catch (error) {
      return { ok: false, error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Project input is invalid.",
        retryable: false,
      } };
    }
  }

  async updateProject(input: UpdateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const stopped = this.check<ProjectRecord>(options);
    if (stopped) return stopped;
    const current = this.projects.get(input.projectId);
    if (!current) return { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
    if (current.revision !== input.expectedRevision) return this.conflict(current.revision);
    try {
      const title = validateTitle(input.title);
      const description = input.description.trim();
      if (description.length > 1_000) throw new Error("Project description must not exceed 1,000 characters.");
      const next = {
        ...current, title, description,
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      };
      this.projects.set(current.id, clone(next));
      return { ok: true, data: clone(next) };
    } catch (error) {
      return { ok: false, error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Project input is invalid.",
        retryable: false,
      } };
    }
  }

  async saveSnapshot(input: SaveProjectSnapshotInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>> {
    const stopped = this.check<ProjectRecord>(options);
    if (stopped) return stopped;
    const current = this.projects.get(input.projectId);
    if (!current) return { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
    if (current.revision !== input.expectedRevision) return this.conflict(current.revision);
    try {
      const snapshot = parseWorkspaceSnapshot(input.snapshot);
      const next: ProjectRecord = {
        ...current,
        snapshot,
        activePdbId: snapshot.structure?.pdbId ?? null,
        revision: current.revision + 1,
        updatedAt: this.now().toISOString(),
      };
      this.projects.set(current.id, clone(next));
      return { ok: true, data: clone(next) };
    } catch (error) {
      return { ok: false, error: {
        code: "INVALID_INPUT",
        message: error instanceof Error ? error.message : "Workspace snapshot is invalid.",
        retryable: false,
      } };
    }
  }

  async deleteProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<{ projectId: string }>> {
    const stopped = this.check<{ projectId: string }>(options);
    if (stopped) return stopped;
    if (!this.projects.delete(projectId)) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
    }
    this.events.delete(projectId);
    return { ok: true, data: { projectId } };
  }

  async listEvents(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord[]>> {
    const stopped = this.check<ProjectEventRecord[]>(options);
    if (stopped) return stopped;
    if (!this.projects.has(projectId)) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
    }
    return { ok: true, data: clone(this.events.get(projectId) ?? []) };
  }

  async appendEvent(projectId: string, event: ProjectEventDraft, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord>> {
    const stopped = this.check<ProjectEventRecord>(options);
    if (stopped) return stopped;
    if (!this.projects.has(projectId)) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Project not found.", retryable: false } };
    }
    const record = { ...clone(event), id: `phase2-event-${this.nextId++}`, projectId };
    const current = this.events.get(projectId) ?? [];
    this.events.set(projectId, [record, ...current]);
    return { ok: true, data: clone(record) };
  }

  private conflict<T>(currentRevision: number): ProjectDataResult<T> {
    return { ok: false, error: {
      code: "CONFLICT",
      message: "This project was updated in another session.",
      retryable: false,
      currentRevision,
    } };
  }
}
