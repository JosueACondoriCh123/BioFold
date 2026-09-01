export type EvidenceLevel =
  | "observed"
  | "calculated"
  | "heuristic"
  | "unavailable";

export type ProvenanceSource = "fixture" | "rcsb" | "local-calculation";

export type CommandErrorCode =
  | "INVALID_INPUT"
  | "STRUCTURE_NOT_LOADED"
  | "FETCH_FAILED"
  | "PARSE_FAILED"
  | "SELECTION_NOT_FOUND"
  | "AMBIGUOUS_ATOM"
  | "RENDER_FAILED"
  | "AUTH_REQUIRED"
  | "WORKSPACE_INACTIVE"
  | "CANCELLED";

export interface CommandResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: CommandErrorCode;
    message: string;
    retryable: boolean;
  };
  evidence: EvidenceLevel;
  provenance?: {
    source: ProvenanceSource;
    structureId?: string;
  };
  activityId: string;
}

export type CommandName =
  | "load_structure"
  | "get_structure_summary"
  | "focus_residues"
  | "set_representation"
  | "show_surface"
  | "measure_distance"
  | "preview_mutation_context"
  | "reset_workspace";

export type WebMcpStatus =
  | "inactive"
  | "unavailable"
  | "registering"
  | "ready"
  | "partial"
  | "error";

export type CommandOrigin = "human" | "agent";

export type RepresentationStyle = "cartoon" | "stick" | "sphere" | "line";
export type ColorScheme = "chain" | "spectrum" | "element";

export type SurfaceRequest = {
  visible: boolean;
  opacity: number;
};

export type SurfaceOperation =
  | { status: "idle" }
  | { status: "loading"; request: SurfaceRequest }
  | { status: "error"; request: SurfaceRequest; message: string };

export interface AtomRecord {
  serial: number;
  atomName: string;
  element: string;
  chain: string;
  residueNumber: number;
  residueName: string;
  insertionCode?: string;
  x: number;
  y: number;
  z: number;
  hetero: boolean;
}

export interface ResidueRef {
  chain: string;
  residueNumber: number;
  insertionCode?: string;
}

export interface AtomRef extends ResidueRef {
  atomName: string;
}

export interface StructureSummary {
  chains: string[];
  chainCount: number;
  residueCount: number;
  atomCount: number;
  ligandCount: number;
  waterCount: number;
}

export interface LoadedStructure {
  id: string;
  source: "fixture" | "rcsb";
  format: "cif";
  loadedAt: string;
}

export interface DistanceMeasurement {
  from: AtomRef;
  to: AtomRef;
  angstroms: number;
}

export interface NeighborResidue extends ResidueRef {
  residueName: string;
  distance: number;
}

export interface MutationHeuristic {
  dimension: "charge" | "size" | "hydrophobicity";
  from: string;
  to: string;
  changed: boolean;
  note: string;
}

export interface MutationPreview {
  residue: ResidueRef;
  originalAminoAcid: string;
  targetAminoAcid: string;
  neighbors: NeighborResidue[];
  heuristics: MutationHeuristic[];
  disclaimer: string;
}

export interface CommandInputMap {
  load_structure: { pdbId: string };
  get_structure_summary: Record<string, never>;
  focus_residues: { residues: ResidueRef[]; label?: boolean };
  set_representation: { style: RepresentationStyle; colorScheme: ColorScheme };
  show_surface: { visible: boolean; opacity?: number };
  measure_distance: { from: AtomRef; to: AtomRef };
  preview_mutation_context: { residue: ResidueRef; toAminoAcid: string };
  reset_workspace: { scope: "view" | "all" };
}

export interface CommandOutputMap {
  load_structure: {
    structureId: string;
    source: "fixture" | "rcsb";
    summary: StructureSummary;
  };
  get_structure_summary: StructureSummary;
  focus_residues: { residues: ResidueRef[]; label: boolean; changedView: true };
  set_representation: {
    style: RepresentationStyle;
    colorScheme: ColorScheme;
    changedView: true;
  };
  show_surface: { visible: boolean; opacity: number; changedView: true };
  measure_distance: DistanceMeasurement & { units: "angstrom"; changedView: true };
  preview_mutation_context: MutationPreview & { neighborCount: number; changedView: true };
  reset_workspace: { scope: "view" | "all"; changedView: true };
}

export type CommandInput<K extends CommandName> = CommandInputMap[K];
export type CommandOutput<K extends CommandName> = CommandOutputMap[K];

export interface ActivityEntry {
  id: string;
  command: CommandName;
  origin: CommandOrigin;
  status: "success" | "error";
  message: string;
  createdAt: string;
  durationMs: number;
  agentKind?: "webmcp" | "assistant";
  approvedByUser?: boolean;
  sourceMessageId?: string;
}

export interface CommandContext {
  origin: CommandOrigin;
  signal?: AbortSignal;
  /** Bound by registered tools, never accepted from tool input. */
  workspaceGeneration?: number;
  /** Internal agent classification; never accepted from a command payload. */
  agentKind?: "webmcp" | "assistant";
  /** Assistant commands require an explicit user confirmation before dispatch. */
  approvedByUser?: boolean;
  sourceMessageId?: string;
}
