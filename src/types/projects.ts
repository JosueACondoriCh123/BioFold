import type {
  ActivityEntry,
  ColorScheme,
  CommandInputMap,
  CommandName,
  CommandOutputMap,
  CommandOrigin,
  DistanceMeasurement,
  EvidenceLevel,
  MutationPreview,
  ProvenanceSource,
  RepresentationStyle,
  ResidueRef,
  StructureSummary,
} from "./domain";

export type ViewerCameraState = readonly [
  number, number, number, number, number, number, number, number,
];

export interface WorkspaceSnapshotV1 {
  schemaVersion: 1;
  structure: {
    pdbId: string;
    source: "fixture" | "rcsb";
  } | null;
  summary?: StructureSummary;
  view: {
    representation: RepresentationStyle;
    colorScheme: ColorScheme;
    camera: ViewerCameraState | null;
  };
  surface: {
    visible: boolean;
    opacity: number;
  };
  selectedResidues: ResidueRef[];
  measurement?: DistanceMeasurement;
  mutation?: MutationPreview;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  activePdbId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord extends ProjectSummary {
  ownerId: string;
  snapshot: WorkspaceSnapshotV1;
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  snapshot?: WorkspaceSnapshotV1;
}

export interface UpdateProjectInput {
  projectId: string;
  expectedRevision: number;
  title: string;
  description: string;
}

export interface SaveProjectSnapshotInput {
  projectId: string;
  expectedRevision: number;
  snapshot: WorkspaceSnapshotV1;
}

interface ProjectEventBase {
  activityId: string;
  origin: CommandOrigin;
  agentKind?: "webmcp" | "assistant";
  approvedByUser?: boolean;
  sourceMessageId?: string;
  status: ActivityEntry["status"];
  evidence: EvidenceLevel;
  provenance?: {
    source: ProvenanceSource;
    structureId?: string;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  durationMs: number;
  createdAt: string;
}

export type ProjectEventDraft = {
  [K in CommandName]: ProjectEventBase & {
    command: K;
    input: CommandInputMap[K];
    output?: CommandOutputMap[K];
  }
}[CommandName];

export type ProjectEventRecord = ProjectEventDraft & {
  id: string;
  projectId: string;
};

export type ProjectDataErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "CANCELLED"
  | "UNKNOWN_ERROR";

export interface ProjectDataError {
  code: ProjectDataErrorCode;
  message: string;
  retryable: boolean;
  currentRevision?: number;
}

export type ProjectDataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ProjectDataError };

export interface ProjectRequestOptions {
  signal?: AbortSignal;
}

/** Public persistence boundary. It deliberately exposes no Supabase types. */
export interface ProjectDataPort {
  listProjects(options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectSummary[]>>;
  getProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>>;
  createProject(input: CreateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>>;
  updateProject(input: UpdateProjectInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>>;
  saveSnapshot(input: SaveProjectSnapshotInput, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectRecord>>;
  deleteProject(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<{ projectId: string }>>;
  listEvents(projectId: string, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord[]>>;
  appendEvent(projectId: string, event: ProjectEventDraft, options?: ProjectRequestOptions): Promise<ProjectDataResult<ProjectEventRecord>>;
}

const representations: RepresentationStyle[] = ["cartoon", "stick", "sphere", "line"];
const colors: ColorScheme[] = ["chain", "spectrum", "element"];

export function parseViewerCameraState(input: unknown): ViewerCameraState {
  if (!Array.isArray(input) || input.length !== 8 || input.some((value) =>
    typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Camera state must contain exactly eight finite numbers.");
  }
  return input.slice() as unknown as ViewerCameraState;
}

export function createEmptyWorkspaceSnapshot(pdbId?: string): WorkspaceSnapshotV1 {
  const normalized = pdbId?.trim().toUpperCase();
  if (normalized && !/^[A-Z0-9]{4}$/.test(normalized)) {
    throw new Error("A project structure must use a four-character PDB ID.");
  }
  return {
    schemaVersion: 1,
    structure: normalized ? {
      pdbId: normalized,
      source: normalized === "1CRN" || normalized === "4HHB" ? "fixture" : "rcsb",
    } : null,
    view: { representation: "cartoon", colorScheme: "chain", camera: null },
    surface: { visible: false, opacity: 0.72 },
    selectedResidues: [],
  };
}

export function parseWorkspaceSnapshot(input: unknown): WorkspaceSnapshotV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Workspace snapshot must be an object.");
  }
  const snapshot = input as Partial<WorkspaceSnapshotV1>;
  if (snapshot.schemaVersion !== 1 || !snapshot.view || !snapshot.surface ||
      !representations.includes(snapshot.view.representation) ||
      !colors.includes(snapshot.view.colorScheme) ||
      typeof snapshot.surface.visible !== "boolean" ||
      typeof snapshot.surface.opacity !== "number" ||
      !Number.isFinite(snapshot.surface.opacity) || snapshot.surface.opacity < 0.1 ||
      snapshot.surface.opacity > 1 || !Array.isArray(snapshot.selectedResidues)) {
    throw new Error("Workspace snapshot does not match schema version 1.");
  }
  if (snapshot.structure !== null) {
    const structure = snapshot.structure;
    if (!structure || !/^[A-Z0-9]{4}$/.test(structure.pdbId) ||
        (structure.source !== "fixture" && structure.source !== "rcsb")) {
      throw new Error("Workspace snapshot contains an invalid structure reference.");
    }
  }
  const camera = snapshot.view.camera === null
    ? null
    : parseViewerCameraState(snapshot.view.camera);
  return structuredClone({ ...snapshot, view: { ...snapshot.view, camera } }) as WorkspaceSnapshotV1;
}
