import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geometryClient } from "../src/adapters/geometryClient";
import {
  ViewerPortError,
  viewerPort,
  type PreparedStructure,
} from "../src/adapters/viewerPort";
import { structureGateway } from "../src/adapters/structureGateway";
import { commandBus } from "../src/core/commandBus";
import { workspaceSession } from "../src/core/workspaceSession";
import { useAppStore } from "../src/store/appStore";
import type { AtomRecord, StructureSummary } from "../src/types/domain";

const atom: AtomRecord = {
  serial: 1,
  atomName: "CA",
  element: "C",
  chain: "A",
  residueNumber: 1,
  residueName: "ALA",
  x: 0,
  y: 0,
  z: 0,
  hetero: false,
};

const summary: StructureSummary = {
  chains: ["A"],
  chainCount: 1,
  residueCount: 1,
  atomCount: 1,
  ligandCount: 0,
  waterCount: 0,
};

function preparedStructure(): PreparedStructure {
  return {
    model: {} as PreparedStructure["model"],
    atoms: [atom],
    committed: false,
    discarded: false,
  };
}

function setPreviousWorkspace() {
  useAppStore.setState({
    structure: {
      id: "1CRN",
      source: "fixture",
      format: "cif",
      loadedAt: "2026-08-27T00:00:00.000Z",
    },
    summary,
    loading: false,
    error: undefined,
    activity: [],
    surfaceVisible: false,
    surfaceOpacity: 0.72,
    surfaceOperation: { status: "idle" },
  });
}

function mockSuccessfulPreparation(prepared = preparedStructure()) {
  vi.spyOn(structureGateway, "load").mockResolvedValue({
    id: "4HHB",
    source: "fixture",
    format: "cif",
    data: "data_4HHB",
  });
  vi.spyOn(viewerPort, "prepareStructure").mockReturnValue(prepared);
  vi.spyOn(geometryClient, "summarize").mockResolvedValue(summary);
  vi.spyOn(viewerPort, "commitStructure").mockImplementation((candidate) => {
    candidate.committed = true;
  });
  vi.spyOn(viewerPort, "discardStructure").mockImplementation((candidate) => {
    candidate.discarded = true;
  });
  return prepared;
}

beforeEach(() => {
  vi.spyOn(viewerPort, "isReady").mockReturnValue(true);
  workspaceSession.setContext("test-user", true);
  setPreviousWorkspace();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Command Bus atomicity", () => {
  it("rejects unconfirmed assistant actions without changing viewer or activity", async () => {
    const representationSpy = vi.spyOn(viewerPort, "setRepresentation");

    const result = await commandBus.execute(
      "set_representation",
      { style: "stick", colorScheme: "spectrum" },
      { origin: "agent", agentKind: "assistant", sourceMessageId: "message-1" },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(representationSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().activity).toHaveLength(0);
  });

  it("labels confirmed assistant actions in the shared activity stream", async () => {
    vi.spyOn(viewerPort, "setRepresentation").mockImplementation(() => undefined);

    const result = await commandBus.execute(
      "set_representation",
      { style: "stick", colorScheme: "spectrum" },
      {
        origin: "agent",
        agentKind: "assistant",
        approvedByUser: true,
        sourceMessageId: "message-1",
      },
    );

    expect(result.ok).toBe(true);
    expect(useAppStore.getState().activity[0]).toMatchObject({
      agentKind: "assistant",
      approvedByUser: true,
      sourceMessageId: "message-1",
    });
  });

  it("publishes one typed completion to persistence observers", async () => {
    vi.spyOn(viewerPort, "setRepresentation").mockImplementation(() => undefined);
    const listener = vi.fn();
    const unsubscribe = commandBus.subscribe(listener);

    try {
      const result = await commandBus.execute(
        "set_representation",
        { style: "stick", colorScheme: "spectrum" },
        { origin: "human" },
      );

      expect(result.ok).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        command: "set_representation",
        input: { style: "stick", colorScheme: "spectrum" },
        result,
        activity: expect.objectContaining({
          id: result.activityId,
          command: "set_representation",
          origin: "human",
          status: "success",
        }),
      }));
    } finally {
      unsubscribe();
    }
  });

  it("cancels before loading without touching the gateway, viewer, or workspace", async () => {
    const controller = new AbortController();
    controller.abort("already-cancelled");
    const gatewaySpy = vi.spyOn(structureGateway, "load");
    const prepareSpy = vi.spyOn(viewerPort, "prepareStructure");

    const result = await commandBus.execute(
      "load_structure",
      { pdbId: "4HHB" },
      { origin: "agent", signal: controller.signal },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CANCELLED", retryable: true },
      evidence: "unavailable",
    });
    expect(gatewaySpy).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      loading: false,
      structure: { id: "1CRN" },
      summary,
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0].id).toBe(result.activityId);
  });

  it("cancels during loading without preparing or replacing the workspace", async () => {
    const controller = new AbortController();
    let resolveLoad!: (value: Awaited<ReturnType<typeof structureGateway.load>>) => void;
    const pendingLoad = new Promise<Awaited<ReturnType<typeof structureGateway.load>>>((resolve) => {
      resolveLoad = resolve;
    });
    vi.spyOn(structureGateway, "load").mockReturnValue(pendingLoad);
    const prepareSpy = vi.spyOn(viewerPort, "prepareStructure");

    const execution = commandBus.execute(
      "load_structure",
      { pdbId: "4HHB" },
      { origin: "agent", signal: controller.signal },
    );
    await vi.waitFor(() => expect(structureGateway.load).toHaveBeenCalled());
    controller.abort("cancelled-during-fetch");
    resolveLoad({
      id: "4HHB",
      source: "fixture",
      format: "cif",
      data: "data_4HHB",
    });

    const result = await execution;
    expect(result.error?.code).toBe("CANCELLED");
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      loading: false,
      structure: { id: "1CRN" },
      summary,
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0].id).toBe(result.activityId);
  });

  it("commits viewer and Zustand together after preparation and summary", async () => {
    const prepared = mockSuccessfulPreparation();

    const result = await commandBus.execute(
      "load_structure",
      { pdbId: "4hhb" },
      { origin: "agent" },
    );

    expect(result).toMatchObject({
      ok: true,
      data: { structureId: "4HHB", source: "fixture" },
      evidence: "observed",
      provenance: { source: "fixture", structureId: "4HHB" },
    });
    expect(viewerPort.commitStructure).toHaveBeenCalledWith(prepared);
    expect(viewerPort.discardStructure).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      loading: false,
      structure: { id: "4HHB", source: "fixture" },
      summary,
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0]).toMatchObject({
      origin: "agent",
      command: "load_structure",
      status: "success",
    });
    expect(useAppStore.getState().activity[0].id).toBe(result.activityId);
  });

  it("cancels during analysis, discards the candidate, and preserves the previous workspace", async () => {
    const prepared = preparedStructure();
    const controller = new AbortController();
    let resolveSummary!: (value: StructureSummary) => void;
    const pendingSummary = new Promise<StructureSummary>((resolve) => {
      resolveSummary = resolve;
    });
    mockSuccessfulPreparation(prepared);
    vi.mocked(geometryClient.summarize).mockReturnValue(pendingSummary);

    const execution = commandBus.execute(
      "load_structure",
      { pdbId: "4HHB" },
      { origin: "agent", signal: controller.signal },
    );
    await vi.waitFor(() => expect(geometryClient.summarize).toHaveBeenCalled());
    controller.abort("agent-cancelled");
    resolveSummary(summary);

    const result = await execution;
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CANCELLED", retryable: true },
      evidence: "unavailable",
    });
    expect(viewerPort.commitStructure).not.toHaveBeenCalled();
    expect(viewerPort.discardStructure).toHaveBeenCalledWith(prepared);
    expect(useAppStore.getState()).toMatchObject({
      loading: false,
      structure: { id: "1CRN" },
      summary,
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0]).toMatchObject({
      origin: "agent",
      status: "error",
    });
  });

  it("classifies parse and render failures without replacing the current store", async () => {
    vi.spyOn(structureGateway, "load").mockResolvedValue({
      id: "4HHB",
      source: "fixture",
      format: "cif",
      data: "invalid",
    });
    vi.spyOn(viewerPort, "prepareStructure").mockImplementation(() => {
      throw new ViewerPortError("PARSE_FAILED", "Invalid mmCIF data.");
    });

    const parseResult = await commandBus.execute(
      "load_structure",
      { pdbId: "4HHB" },
      { origin: "agent" },
    );
    expect(parseResult.error?.code).toBe("PARSE_FAILED");
    expect(useAppStore.getState().structure?.id).toBe("1CRN");

    vi.restoreAllMocks();
    vi.spyOn(viewerPort, "isReady").mockReturnValue(true);
    setPreviousWorkspace();
    const prepared = mockSuccessfulPreparation();
    vi.mocked(viewerPort.commitStructure).mockImplementation(() => {
      throw new ViewerPortError("RENDER_FAILED", "WebGL rejected the scene.");
    });

    const renderResult = await commandBus.execute(
      "load_structure",
      { pdbId: "4HHB" },
      { origin: "agent" },
    );
    expect(renderResult.error?.code).toBe("RENDER_FAILED");
    expect(viewerPort.discardStructure).toHaveBeenCalledWith(prepared);
    expect(useAppStore.getState().structure?.id).toBe("1CRN");
  });

  it("rejects strict invalid input before touching the gateway or viewer", async () => {
    const gatewaySpy = vi.spyOn(structureGateway, "load");
    const prepareSpy = vi.spyOn(viewerPort, "prepareStructure");

    const result = await commandBus.execute(
      "load_structure",
      { pdbId: "BAD", unsupported: true } as never,
      { origin: "agent" },
    );

    expect(result.error?.code).toBe("INVALID_INPUT");
    expect(gatewaySpy).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().structure?.id).toBe("1CRN");
    expect(useAppStore.getState().activity).toHaveLength(1);
  });

  it("publishes surface loading and commits visibility only after rendering", async () => {
    let resolveSurface!: () => void;
    const pendingSurface = new Promise<void>((resolve) => {
      resolveSurface = resolve;
    });
    vi.spyOn(viewerPort, "showSurface").mockReturnValue(pendingSurface);

    const execution = commandBus.execute(
      "show_surface",
      { visible: true, opacity: 0.55 },
      { origin: "agent" },
    );

    await vi.waitFor(() => {
      expect(useAppStore.getState().surfaceOperation).toEqual({
        status: "loading",
        request: { visible: true, opacity: 0.55 },
      });
    });
    expect(useAppStore.getState()).toMatchObject({
      surfaceVisible: false,
      surfaceOpacity: 0.72,
      activity: [],
    });

    resolveSurface();
    const result = await execution;

    expect(result).toMatchObject({ ok: true, data: { visible: true, opacity: 0.55 } });
    expect(useAppStore.getState()).toMatchObject({
      surfaceVisible: true,
      surfaceOpacity: 0.55,
      surfaceOperation: { status: "idle" },
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0]).toMatchObject({
      id: result.activityId,
      command: "show_surface",
      origin: "agent",
      status: "success",
    });
  });

  it("keeps the previous surface and exposes a retryable visual error", async () => {
    useAppStore.setState({ surfaceVisible: true, surfaceOpacity: 0.4 });
    vi.spyOn(viewerPort, "showSurface").mockRejectedValue(
      new ViewerPortError("RENDER_FAILED", "Surface triangulation failed."),
    );

    const result = await commandBus.execute(
      "show_surface",
      { visible: true, opacity: 0.8 },
      { origin: "human" },
    );

    expect(result.error?.code).toBe("RENDER_FAILED");
    expect(useAppStore.getState()).toMatchObject({
      surfaceVisible: true,
      surfaceOpacity: 0.4,
      surfaceOperation: {
        status: "error",
        request: { visible: true, opacity: 0.8 },
        message: "Surface triangulation failed.",
      },
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
    expect(useAppStore.getState().activity[0]).toMatchObject({
      id: result.activityId,
      command: "show_surface",
      status: "error",
    });
  });

  it("cancels surface rendering without changing the applied surface or showing an error", async () => {
    useAppStore.setState({ surfaceVisible: true, surfaceOpacity: 0.4 });
    const controller = new AbortController();
    let resolveSurface!: () => void;
    vi.spyOn(viewerPort, "showSurface").mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSurface = resolve;
      }),
    );

    const execution = commandBus.execute(
      "show_surface",
      { visible: false, opacity: 0.4 },
      { origin: "agent", signal: controller.signal },
    );
    await vi.waitFor(() => expect(useAppStore.getState().surfaceOperation.status).toBe("loading"));
    controller.abort("agent-cancelled");
    resolveSurface();

    const result = await execution;
    expect(result.error?.code).toBe("CANCELLED");
    expect(useAppStore.getState()).toMatchObject({
      surfaceVisible: true,
      surfaceOpacity: 0.4,
      surfaceOperation: { status: "idle" },
      error: undefined,
    });
    expect(useAppStore.getState().activity).toHaveLength(1);
  });
});
