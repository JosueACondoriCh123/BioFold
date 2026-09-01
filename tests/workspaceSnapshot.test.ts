import { beforeEach, describe, expect, it } from "vitest";
import { captureWorkspaceSnapshot } from "../src/core/workspaceSnapshot";
import { useAppStore } from "../src/store/appStore";

beforeEach(() => {
  useAppStore.getState().clearSession();
});
describe("workspace snapshot capture", () => {
  it("captures confirmed scene state and excludes transient operations", () => {
    useAppStore.setState({
      structure: { id: "4HHB", source: "fixture", format: "cif", loadedAt: "2026-09-01T00:00:00.000Z" },
      summary: { chains: ["A", "B", "C", "D"], chainCount: 4, residueCount: 574, atomCount: 4779, ligandCount: 6, waterCount: 0 },
      representation: "stick",
      colorScheme: "spectrum",
      surfaceVisible: true,
      surfaceOpacity: 0.55,
      surfaceOperation: { status: "loading", request: { visible: false, opacity: 0.8 } },
      selectedResidues: [{ chain: "A", residueNumber: 10 }],
      loading: true,
      error: "Transient error",
      activity: [],
    });

    expect(captureWorkspaceSnapshot([1, 2, 3, 4, 0, 0, 0, 1])).toMatchObject({
      schemaVersion: 1,
      structure: { pdbId: "4HHB", source: "fixture" },
      view: {
        representation: "stick",
        colorScheme: "spectrum",
        camera: [1, 2, 3, 4, 0, 0, 0, 1],
      },
      surface: { visible: true, opacity: 0.55 },
      selectedResidues: [{ chain: "A", residueNumber: 10 }],
    });
    expect(captureWorkspaceSnapshot(null)).not.toHaveProperty("loading");
    expect(captureWorkspaceSnapshot(null)).not.toHaveProperty("surfaceOperation");
    expect(captureWorkspaceSnapshot(null)).not.toHaveProperty("activity");
  });
});
