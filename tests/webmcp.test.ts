import { beforeEach, describe, expect, it, vi } from "vitest";
import { BIOFOLD_TOOLS, registerBioFoldTools } from "../src/adapters/webmcp";
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
};

beforeEach(() => {
  workspaceSession.setContext("test-user", true);
  useAppStore.setState({ viewerReady: true, webmcpStatus: "unavailable" });
  vi.restoreAllMocks();
});

describe("WebMCP adapter", () => {
  it("registers the eight audited contracts once", async () => {
    const registered: WebMCPToolDefinition[] = [];
    const modelContext: WebMCPModelContext = {
      registerTool: (tool) => {
        registered.push(tool);
      },
    };

    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);
    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);

    expect(registered.map((tool) => tool.name)).toEqual(COMMAND_NAMES);
    expect(registered).toHaveLength(8);
    expect(useAppStore.getState()).toMatchObject({
      webmcpStatus: "ready",
      webmcpSupported: true,
      registeredToolCount: 8,
    });
  });

  it("does not cache an unavailable browser context", async () => {
    await expect(registerBioFoldTools(undefined)).resolves.toBe(false);
    expect(useAppStore.getState().webmcpStatus).toBe("unavailable");

    const registerTool = vi.fn();
    await expect(registerBioFoldTools({ registerTool })).resolves.toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(8);
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
      registeredToolCount: 7,
    });

    await expect(registerBioFoldTools(modelContext)).resolves.toBe(true);
    expect(registered).toHaveLength(8);
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
    expect(registerTool).toHaveBeenCalledTimes(8);
  });

  it("routes all tools through the shared command bus with agent origin and AbortSignal", async () => {
    const expected = { ok: true, evidence: "calculated", activityId: "test" } as const;
    const spy = vi.spyOn(commandBus, "execute").mockResolvedValue(expected);
    const controller = new AbortController();

    for (const tool of BIOFOLD_TOOLS) {
      await tool.execute(VALID_INPUTS[tool.name], { signal: controller.signal });
    }

    expect(spy).toHaveBeenCalledTimes(8);
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
