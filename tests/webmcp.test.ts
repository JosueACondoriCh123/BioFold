import { beforeEach, describe, expect, it, vi } from "vitest";
import { BIOFOLD_TOOLS, registerBioFoldTools } from "../src/adapters/webmcp";
import { commandBus } from "../src/core/commandBus";
import { useAppStore } from "../src/store/appStore";

beforeEach(() => {
  useAppStore.getState().setWebMcpStatus(false, 0);
  vi.restoreAllMocks();
});

describe("WebMCP adapter", () => {
  it("registers the eight planned tools", async () => {
    const registered: WebMCPToolDefinition[] = [];
    const modelContext: WebMCPModelContext = {
      registerTool: (tool) => {
        registered.push(tool);
      },
    };
    await registerBioFoldTools(modelContext);
    expect(registered).toHaveLength(8);
    expect(registered.map((tool) => tool.name)).toEqual([
      "load_structure",
      "get_structure_summary",
      "focus_residues",
      "set_representation",
      "show_surface",
      "measure_distance",
      "preview_mutation_context",
      "reset_workspace",
    ]);
  });

  it("routes agent execution through the shared command bus with AbortSignal", async () => {
    const expected = { ok: true, evidence: "calculated", activityId: "test" } as const;
    const spy = vi.spyOn(commandBus, "execute").mockResolvedValue(expected);
    const controller = new AbortController();
    const tool = BIOFOLD_TOOLS.find((item) => item.name === "get_structure_summary")!;
    await tool.execute({}, { signal: controller.signal });
    expect(spy).toHaveBeenCalledWith(
      "get_structure_summary",
      {},
      { origin: "agent", signal: controller.signal },
    );
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});
