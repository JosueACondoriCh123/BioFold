import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BIOFOLD_TOOLS, getWebMcpContext, registerBioFoldTools, unregisterBioFoldTools } from "../src/adapters/webmcp";
import { COMMAND_NAMES } from "../src/core/commandContracts";
import { commandBus } from "../src/core/commandBus";
import { workspaceSession } from "../src/core/workspaceSession";
import { useAppStore } from "../src/store/appStore";

const VALID_INPUTS: Record<string, unknown> = {
  load_structure: { pdbId: "1CRN" },
  get_structure_summary: {},
  focus_residues: { residues: [{ chain: "A", residueNumber: 10 }], label: true },
  set_representation: { style: "stick", colorScheme: "element" },
  show_surface: { visible: true, opacity: 0.5 },
  measure_distance: {
    from: { chain: "A", residueNumber: 1, atomName: "CA" },
    to: { chain: "A", residueNumber: 10, atomName: "CA" },
  },
  preview_mutation_context: {
    residue: { chain: "A", residueNumber: 10 },
    toAminoAcid: "W",
  },
  reset_workspace: { scope: "view" },
  export_publication_figure: { resolution: "4k", background: "transparent", format: "png" },
  annotate_active_site: {
    chain: "A",
    residueNumber: 41,
    note: "Active site base",
    color: "#5ccfb5",
  },
  query_uniprot_annotations: {
    pdbId: "1CRN",
    highlightInViewer: true,
  },
  compare_structures_rmsd: {
    referencePdbId: "6LU7",
    mobilePdbId: "1CRN",
  },
  save_project_snapshot: {
    title: "WebMCP Snapshot",
    description: "Saved via WebMCP tool",
  },
};

beforeEach(() => {
  workspaceSession.setContext("test-user", true);
  useAppStore.setState({ viewerReady: true, webmcpStatus: "unavailable" });
  vi.restoreAllMocks();
});

afterEach(() => {
  unregisterBioFoldTools();
  vi.unstubAllGlobals();
});

describe("WebMCP adapter", () => {
  it("prefers document.modelContext and falls back to the early navigator API", async () => {
    const current = { registerTool: vi.fn() };
    const legacy = { registerTool: vi.fn() };
    vi.stubGlobal("document", { modelContext: current });
    vi.stubGlobal("navigator", { modelContext: legacy });
    expect(getWebMcpContext()).toBe(current);
    await expect(registerBioFoldTools()).resolves.toBe(true);
    expect(legacy.registerTool).not.toHaveBeenCalled();
    vi.stubGlobal("document", { modelContext: {} });
    await expect(registerBioFoldTools()).resolves.toBe(true);
    expect(legacy.registerTool).toHaveBeenCalledTimes(COMMAND_NAMES.length);
  });

  it("uses browser annotations for mutable queries and externally supplied output", () => {
    const annotations = (name: string) => BIOFOLD_TOOLS.find(tool => tool.name === name)!.annotations;
    expect(annotations("get_structure_summary")).toMatchObject({ readOnlyHint: true });
    expect(annotations("query_uniprot_annotations")).toEqual({ readOnlyHint: false, untrustedContentHint: true, consequentialHint: false });
    expect(annotations("reset_workspace")).toMatchObject({ consequentialHint: true });
    expect(annotations("annotate_active_site")).toMatchObject({ readOnlyHint: false, untrustedContentHint: true });
  });

  it("unregisters legacy tools on exit and does not leak a synchronous registration", async () => {
    const tools = new Map<string, WebMCPToolDefinition>();
    const legacy: WebMCPModelContext = {
      registerTool: (tool) => { tools.set(tool.name, tool); },
      unregisterTool: (name) => { tools.delete(name); },
    };
    const pending = registerBioFoldTools(legacy);
    workspaceSession.setContext("test-user", false);
    await expect(pending).resolves.toBe(false);
    expect(tools.size).toBe(0);
    workspaceSession.setContext("test-user", true);
    await expect(registerBioFoldTools(legacy)).resolves.toBe(true);
    expect(tools.size).toBe(COMMAND_NAMES.length);
    unregisterBioFoldTools();
    expect(tools.size).toBe(0);
  });

  it("reports the browser's registration error for diagnosis", async () => {
    await expect(registerBioFoldTools({ registerTool: () => {
      throw new DOMException("The tools permissions policy blocks registration.", "NotAllowedError");
    } })).resolves.toBe(false);
    expect(useAppStore.getState()).toMatchObject({ webmcpStatus: "error", registeredToolCount: 0 });
    expect(useAppStore.getState().webmcpError).toContain("The tools permissions policy blocks registration.");
  });

  it("registers the thirteen audited contracts once", async () => {
    const registered: WebMCPToolDefinition[] = [];
    const modelContext: WebMCPModelContext = {
      registerTool: (tool) => {
        registered.push(tool);
      },
    };

    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);
    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);

    expect(registered.map((tool) => tool.name)).toEqual(COMMAND_NAMES);
    expect(registered).toHaveLength(13);
    expect(useAppStore.getState()).toMatchObject({
      webmcpStatus: "ready",
      webmcpSupported: true,
      registeredToolCount: 13,
    });
  });

  it("does not cache an unavailable browser context", async () => {
    await expect(registerBioFoldTools(undefined)).resolves.toBe(false);
    expect(useAppStore.getState().webmcpStatus).toBe("unavailable");

    const registerTool = vi.fn();
    await expect(registerBioFoldTools({ registerTool })).resolves.toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(13);
  });

  it("preserves successful registrations and retries only a failed tool", async () => {
    let representationAttempts = 0;
    const registered: string[] = [];
    const modelContext: WebMCPModelContext = {
      registerTool: async (tool) => {
        if (tool.name === "set_representation" && representationAttempts++ === 0) {
          throw new Error("temporary registration failure");
        }
        registered.push(tool.name);
      },
    };

    await expect(registerBioFoldTools(modelContext)).resolves.toBe(false);
    expect(useAppStore.getState()).toMatchObject({
      webmcpStatus: "partial",
      registeredToolCount: 12,
    });

    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);
    expect(registered).toHaveLength(13);
    expect(registered.filter((name) => name === "load_structure")).toHaveLength(1);
    expect(representationAttempts).toBe(2);
  });

  it("shares one in-flight registration across concurrent callers", async () => {
    const registerTool = vi.fn(async () => Promise.resolve());
    const modelContext: WebMCPModelContext = { registerTool };

    const first = registerBioFoldTools(modelContext);
    const second = registerBioFoldTools(modelContext);

    expect(first).toBe(second);
    await expect(first).resolves.toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(13);
  });

  it("routes all tools through the shared command bus with agent origin and AbortSignal", async () => {
    const expected = { ok: true, evidence: "calculated", activityId: "test" } as const;
    const spy = vi.spyOn(commandBus, "execute").mockResolvedValue(expected);
    const controller = new AbortController();

    for (const tool of BIOFOLD_TOOLS) {
      await tool.execute(VALID_INPUTS[tool.name], { signal: controller.signal });
    }

    expect(spy).toHaveBeenCalledTimes(13);
    for (const [index, name] of COMMAND_NAMES.entries()) {
      expect(spy).toHaveBeenNthCalledWith(
        index + 1,
        name,
        VALID_INPUTS[name],
        { origin: "agent", agentKind: "webmcp", signal: controller.signal },
      );
    }
  });
});
