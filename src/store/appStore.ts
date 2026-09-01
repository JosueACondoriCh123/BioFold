import { create } from "zustand";
import type {
  ActivityEntry,
  ColorScheme,
  DistanceMeasurement,
  LoadedStructure,
  MutationPreview,
  RepresentationStyle,
  ResidueRef,
  SurfaceOperation,
  SurfaceRequest,
  StructureSummary,
  WebMcpStatus,
} from "../types/domain";

interface AppState {
  viewerReady: boolean;
  webmcpStatus: WebMcpStatus;
  webmcpSupported: boolean;
  registeredToolCount: number;
  webmcpError?: string;
  loading: boolean;
  error?: string;
  structure?: LoadedStructure;
  summary?: StructureSummary;
  representation: RepresentationStyle;
  colorScheme: ColorScheme;
  surfaceVisible: boolean;
  surfaceOpacity: number;
  surfaceOperation: SurfaceOperation;
  selectedResidues: ResidueRef[];
  measurement?: DistanceMeasurement;
  mutation?: MutationPreview;
  activity: ActivityEntry[];
  setViewerReady: (ready: boolean) => void;
  setWebMcpStatus: (status: WebMcpStatus, toolCount?: number, error?: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  setStructure: (structure: LoadedStructure, summary: StructureSummary) => void;
  setRepresentation: (style: RepresentationStyle, colorScheme: ColorScheme) => void;
  beginSurfaceUpdate: (request: SurfaceRequest) => void;
  completeSurfaceUpdate: (request: SurfaceRequest) => void;
  failSurfaceUpdate: (request: SurfaceRequest, message: string) => void;
  clearSurfaceError: () => void;
  setSelection: (residues: ResidueRef[]) => void;
  setMeasurement: (measurement?: DistanceMeasurement) => void;
  setMutation: (mutation?: MutationPreview) => void;
  addActivity: (entry: ActivityEntry) => void;
  resetViewState: () => void;
  clearWorkspace: () => void;
  clearSession: () => void;
}

const viewDefaults = {
  representation: "cartoon" as RepresentationStyle,
  colorScheme: "chain" as ColorScheme,
  surfaceVisible: false,
  surfaceOpacity: 0.72,
  surfaceOperation: { status: "idle" } as SurfaceOperation,
  selectedResidues: [] as ResidueRef[],
  measurement: undefined,
  mutation: undefined,
};

export const useAppStore = create<AppState>((set) => ({
  viewerReady: false,
  webmcpStatus: "unavailable",
  webmcpSupported: false,
  registeredToolCount: 0,
  loading: false,
  activity: [],
  ...viewDefaults,
  setViewerReady: (viewerReady) => set({ viewerReady }),
  setWebMcpStatus: (webmcpStatus, registeredToolCount = 0, webmcpError) =>
    set({
      webmcpStatus,
      webmcpSupported:
        registeredToolCount > 0 && (webmcpStatus === "ready" || webmcpStatus === "partial"),
      registeredToolCount,
      webmcpError,
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setStructure: (structure, summary) =>
    set({ structure, summary, error: undefined, ...viewDefaults }),
  setRepresentation: (representation, colorScheme) =>
    set({ representation, colorScheme }),
  beginSurfaceUpdate: (request) =>
    set({ surfaceOperation: { status: "loading", request } }),
  completeSurfaceUpdate: ({ visible: surfaceVisible, opacity: surfaceOpacity }) =>
    set({ surfaceVisible, surfaceOpacity, surfaceOperation: { status: "idle" } }),
  failSurfaceUpdate: (request, message) =>
    set({ surfaceOperation: { status: "error", request, message } }),
  clearSurfaceError: () => set({ surfaceOperation: { status: "idle" } }),
  setSelection: (selectedResidues) => set({ selectedResidues }),
  setMeasurement: (measurement) => set({ measurement }),
  setMutation: (mutation) => set({ mutation }),
  addActivity: (entry) =>
    set((state) => ({ activity: [entry, ...state.activity].slice(0, 50) })),
  resetViewState: () => set({ ...viewDefaults, error: undefined }),
  clearWorkspace: () =>
    set({ structure: undefined, summary: undefined, error: undefined, ...viewDefaults }),
  clearSession: () => set({
    ...viewDefaults, structure: undefined, summary: undefined, error: undefined,
    activity: [], loading: false, viewerReady: false, webmcpStatus: "inactive",
    webmcpSupported: false, registeredToolCount: 0, webmcpError: undefined,
  }),
}));
