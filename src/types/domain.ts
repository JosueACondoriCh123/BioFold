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

export type CommandOrigin = "human" | "agent";

export type RepresentationStyle = "cartoon" | "stick" | "sphere" | "line";
export type ColorScheme = "chain" | "spectrum" | "element";

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

export interface ActivityEntry {
  id: string;
  command: CommandName;
  origin: CommandOrigin;
  status: "success" | "error";
  message: string;
  createdAt: string;
  durationMs: number;
}

export interface CommandContext {
  origin: CommandOrigin;
  signal?: AbortSignal;
}
