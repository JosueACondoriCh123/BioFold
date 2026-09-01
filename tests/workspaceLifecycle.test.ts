import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandBus } from "../src/core/commandBus";
import { workspaceSession } from "../src/core/workspaceSession";
import { geometryClient } from "../src/adapters/geometryClient";
import { viewerPort } from "../src/adapters/viewerPort";
import { registerBioFoldTools, unregisterBioFoldTools } from "../src/adapters/webmcp";
import { useAppStore } from "../src/store/appStore";
import { captureViewerListeners } from "../src/adapters/viewerLifetime";
import type { AtomRecord } from "../src/types/domain";

const atom: AtomRecord = { serial: 1, atomName: "CA", element: "C", chain: "A", residueNumber: 1, residueName: "ALA", x: 0, y: 0, z: 0, hetero: false };
function loaded() {
  useAppStore.getState().setStructure({ id: "1CRN", format: "cif", source: "fixture", loadedAt: "2026-08-30" },
    { chains: ["A"], chainCount: 1, atomCount: 2, residueCount: 2, ligandCount: 0, waterCount: 0 });
  useAppStore.getState().setViewerReady(true);
}
beforeEach(() => {
  workspaceSession.setContext(null, false);
  workspaceSession.setContext("user-a", true);
  loaded();
  vi.spyOn(viewerPort, "isReady").mockReturnValue(true);
});
afterEach(() => {
  workspaceSession.setContext(null, false);
  unregisterBioFoldTools();
  geometryClient.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workspace/session boundary", () => {
  it("cancels surface work even if a background tab never paints the scheduled frame", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 42));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const renderer = vi.spyOn(viewerPort, "showSurface");
    const pending = commandBus.execute("show_surface", { visible: true, opacity: 0.55 });
    workspaceSession.setContext("user-a", false);
    expect((await pending).error?.code).toBe("CANCELLED");
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(renderer).not.toHaveBeenCalled();
    expect(useAppStore.getState().surfaceOperation.status).toBe("idle");
  });
  it("rejects unauthenticated and inactive calls without writing any activity", async () => {
    workspaceSession.setContext(null, false);
    expect((await commandBus.execute("get_structure_summary", {})).error?.code).toBe("AUTH_REQUIRED");
    workspaceSession.setContext("user-a", false);
    expect((await commandBus.execute("get_structure_summary", {})).error?.code).toBe("WORKSPACE_INACTIVE");
    expect(useAppStore.getState().activity).toEqual([]);
  });

  it("preserves confirmed state on navigation and cancels an in-flight measurement", async () => {
    vi.spyOn(viewerPort, "getAtoms").mockReturnValue([atom]);
    const render = vi.spyOn(viewerPort, "showDistance").mockImplementation(() => undefined);
    let finish!: (value: any) => void;
    vi.spyOn(geometryClient, "distance").mockReturnValue(new Promise(resolve => { finish = resolve; }));
    useAppStore.setState({ surfaceVisible: true, surfaceOpacity: 0.55, representation: "stick" });
    const pending = commandBus.execute("measure_distance", {
      from: { chain: "A", residueNumber: 1, atomName: "CA" },
      to: { chain: "A", residueNumber: 2, atomName: "CA" },
    });
    workspaceSession.setContext("user-a", false);
    finish({ fromAtom: atom, toAtom: atom, angstroms: 3 });
    expect((await pending).error?.code).toBe("CANCELLED");
    expect(render).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({ structure: { id: "1CRN" }, surfaceVisible: true, surfaceOpacity: 0.55, representation: "stick", measurement: undefined });
    expect(useAppStore.getState().activity).toHaveLength(1);
  });

  it("never publishes an old user's pending result or activity into a new session", async () => {
    vi.spyOn(viewerPort, "getAtoms").mockReturnValue([atom]);
    const render = vi.spyOn(viewerPort, "showDistance").mockImplementation(() => undefined);
    let finish!: (value: any) => void;
    vi.spyOn(geometryClient, "distance").mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = commandBus.execute("measure_distance", {
      from: { chain: "A", residueNumber: 1, atomName: "CA" },
      to: { chain: "A", residueNumber: 2, atomName: "CA" },
    });
    workspaceSession.setContext(null, false);
    workspaceSession.setContext("user-b", true);
    finish({ fromAtom: atom, toAtom: atom, angstroms: 3 });
    expect((await pending).error?.code).toBe("CANCELLED");
    expect(render).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({ structure: undefined, measurement: undefined, activity: [], loading: false });
  });

  it("restores the applied surface to idle on navigation, without a render error", async () => {
    useAppStore.setState({ surfaceVisible: true, surfaceOpacity: 0.4 });
    vi.spyOn(viewerPort, "showSurface").mockImplementation((_visible, _opacity, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    const pending = commandBus.execute("show_surface", { visible: true, opacity: 0.8 });
    await vi.waitFor(() => expect(viewerPort.showSurface).toHaveBeenCalled());
    workspaceSession.setContext("user-a", false);
    expect((await pending).error?.code).toBe("CANCELLED");
    expect(useAppStore.getState()).toMatchObject({ surfaceVisible: true, surfaceOpacity: 0.4, surfaceOperation: { status: "idle" }, error: undefined });
  });
});

describe("registration lifetime", () => {
  it("removes all tools on exit, re-registers eight, and rejects stale definitions", async () => {
    const tools = new Map<string, WebMCPToolDefinition>();
    const context: WebMCPModelContext = { registerTool: (tool, options) => {
      expect(options?.signal).toBeDefined();
      expect(tools.has(tool.name)).toBe(false);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
    } };
    await registerBioFoldTools(context);
    const stale = tools.get("get_structure_summary")!;
    expect(tools.size).toBe(8);
    workspaceSession.setContext("user-a", false);
    expect(tools.size).toBe(0);
    workspaceSession.setContext("user-a", true);
    await registerBioFoldTools(context);
    expect(tools.size).toBe(8);
    expect(await stale.execute({})).toMatchObject({ ok: false, error: { code: "WORKSPACE_INACTIVE" } });
    expect(await tools.get("get_structure_summary")!.execute({})).toMatchObject({ ok: true });
    expect(useAppStore.getState().activity).toHaveLength(1);
  });

  it("does not register before the viewer is ready or complete a late registration after logout", async () => {
    const registerTool = vi.fn();
    useAppStore.getState().setViewerReady(false);
    await expect(registerBioFoldTools({ registerTool })).resolves.toBe(false);
    expect(registerTool).not.toHaveBeenCalled();
    useAppStore.getState().setViewerReady(true);
    let finish!: () => void;
    registerTool.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const pending = registerBioFoldTools({ registerTool });
    workspaceSession.setContext(null, false);
    finish();
    await expect(pending).resolves.toBe(false);
    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState()).toMatchObject({ registeredToolCount: 0, webmcpStatus: "inactive" });
  });
});

describe("resource cleanup", () => {
  it("restores global registration methods and removes captured listeners", () => {
    const target = new EventTarget();
    const original = target.addEventListener;
    const handler = vi.fn();
    const captured = captureViewerListeners([target], () => {
      target.addEventListener("test", handler);
      return "viewer";
    });
    expect(target.addEventListener).toBe(original);
    target.dispatchEvent(new Event("test"));
    captured.cleanup();
    target.dispatchEvent(new Event("test"));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(() => captureViewerListeners([target], () => {
      target.addEventListener("test", handler);
      throw new Error("WebGL failed");
    })).toThrow("WebGL failed");
    expect(target.addEventListener).toBe(original);
    target.dispatchEvent(new Event("test"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("terminates the worker, rejects pending requests, and can start a new one", async () => {
    const workers: any[] = [];
    class WorkerMock {
      onmessage: any;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() { workers.push(this); }
    }
    vi.stubEnv("MODE", "development");
    vi.stubGlobal("Worker", WorkerMock);
    const pending = geometryClient.summarize([atom]);
    geometryClient.dispose();
    await expect(pending).rejects.toThrow("Cancelled");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const second = geometryClient.summarize([atom]);
    expect(workers).toHaveLength(2);
    const id = workers[1].postMessage.mock.calls[0][0].id;
    workers[1].onmessage({ data: { id, ok: true, result: { atomCount: 1 } } });
    await expect(second).resolves.toMatchObject({ atomCount: 1 });
  });
});
