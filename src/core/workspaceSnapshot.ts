import { viewerPort } from "../adapters/viewerPort";
import { useAppStore } from "../store/appStore";
import { parseWorkspaceSnapshot, type ViewerCameraState, type WorkspaceSnapshotV1 } from "../types/projects";

/**
 * Captures only confirmed, serializable scientific state. Loading/error state,
 * WebGL instances, workers, AbortSignals and the transient activity list stay local.
 */
export function captureWorkspaceSnapshot(
  camera: ViewerCameraState | null = viewerPort.getView(),
): WorkspaceSnapshotV1 {
  const state = useAppStore.getState();
  return parseWorkspaceSnapshot({
    schemaVersion: 1,
    structure: state.structure ? {
      pdbId: state.structure.id,
      source: state.structure.source,
    } : null,
    ...(state.summary ? { summary: state.summary } : {}),
    view: {
      representation: state.representation,
      colorScheme: state.colorScheme,
      camera,
    },
    surface: {
      // surfaceOperation may be loading/error while these fields continue to
      // represent the previously confirmed scene.
      visible: state.surfaceVisible,
      opacity: state.surfaceOpacity,
    },
    selectedResidues: state.selectedResidues,
    ...(state.measurement ? { measurement: state.measurement } : {}),
    ...(state.mutation ? { mutation: state.mutation } : {}),
  });
}
