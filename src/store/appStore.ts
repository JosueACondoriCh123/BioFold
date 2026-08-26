import { create } from "zustand";
import type {
  ActivityEntry,
  ColorScheme,
  DistanceMeasurement,
  LoadedStructure,
  MutationPreview,
  RepresentationStyle,
  ResidueRef,
  StructureSummary,
} from "../types/domain";

interface AppState {
  viewerReady: boolean;
  webmcpSupported: boolean;
  registeredToolCount: number;
  loading: boolean;
  error?: string;
  structure?: LoadedStructure;
  summary?: StructureSummary;
  representation: RepresentationStyle;
  colorScheme: ColorScheme;
  surfaceVisible: boolean;
  surfaceOpacity: number;
  selectedResidues: ResidueRef[];
  measurement?: DistanceMeasurement;
  mutation?: MutationPreview;
  activity: ActivityEntry[];
  setViewerReady: (ready: boolean) => void;
  setWebMcpStatus: (supported: boolean, toolCount?: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  setStructure: (structure: LoadedStructure, summary: StructureSummary) => void;
  setRepresentation: (style: RepresentationStyle, colorScheme: ColorScheme) => void;
  setSurface: (visible: boolean, opacity: number) => void;
  setSelection: (residues: ResidueRef[]) => void;
  setMeasurement: (measurement?: DistanceMeasurement) => void;
  setMutation: (mutation?: MutationPreview) => void;
  addActivity: (entry: ActivityEntry) => void;
  resetViewState: () => void;
  clearWorkspace: () => void;
}

const viewDefaults = {
  representation: "cartoon" as RepresentationStyle,
  colorScheme: "chain" as ColorScheme,
  surfaceVisible: false,
  surfaceOpacity: 0.72,
  selectedResidues: [] as ResidueRef[],
  measurement: undefined,
  mutation: undefined,
};

export const useAppStore = create<AppState>((set) => ({
  viewerReady: false,
  webmcpSupported: false,
  registeredToolCount: 0,
  loading: false,
  activity: [],
  ...viewDefaults,
  setViewerReady: (viewerReady) => set({ viewerReady }),
  setWebMcpStatus: (webmcpSupported, registeredToolCount = 0) =>
    set({ webmcpSupported, registeredToolCount }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setStructure: (structure, summary) =>
    set({ structure, summary, error: undefined, ...viewDefaults }),
  setRepresentation: (representation, colorScheme) =>
    set({ representation, colorScheme }),
  setSurface: (surfaceVisible, surfaceOpacity) =>
    set({ surfaceVisible, surfaceOpacity }),
  setSelection: (selectedResidues) => set({ selectedResidues }),
  setMeasurement: (measurement) => set({ measurement }),
  setMutation: (mutation) => set({ mutation }),
  addActivity: (entry) =>
    set((state) => ({ activity: [entry, ...state.activity].slice(0, 50) })),
  resetViewState: () => set({ ...viewDefaults, error: undefined }),
  clearWorkspace: () =>
    set({ structure: undefined, summary: undefined, error: undefined, ...viewDefaults }),
}));
