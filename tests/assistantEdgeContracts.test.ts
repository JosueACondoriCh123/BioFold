import { describe, expect, it, vi } from "vitest";
import { COMMAND_NAMES, parseCommandInput } from "../src/core/commandContracts";
import { AUDITED_COMMANDS, parseEdgeAssistantRequest, parseModelAnswer, sse } from "../supabase/functions/_shared/assistantProtocol";
import { OPENROUTER_RESPONSE_FORMAT, requestOpenRouter } from "../supabase/functions/_shared/openRouter";

const samples = {
  load_structure: { pdbId: "4hhb" },
  get_structure_summary: {},
  focus_residues: { residues: [{ chain: "a", residueNumber: 10 }], label: true },
  set_representation: { style: "stick", colorScheme: "spectrum" },
  show_surface: { visible: true, opacity: 0.55 },
  measure_distance: { from: { chain: "A", residueNumber: 1, atomName: "ca" }, to: { chain: "A", residueNumber: 10, atomName: "CA" } },
  preview_mutation_context: { residue: { chain: "A", residueNumber: 10 }, toAminoAcid: "w" },
  reset_workspace: { scope: "view" },
  export_publication_figure: { resolution: "4k", background: "transparent", format: "png" },
  annotate_active_site: { chain: "A", residueNumber: 41, note: "Catalytic His41", color: "#5ccfb5" },
  query_uniprot_annotations: { pdbId: "1CRN", highlightInViewer: true },
  compare_structures_rmsd: { referencePdbId: "6LU7", mobilePdbId: "1CRN" },
  save_project_snapshot: { title: "Test Snapshot", description: "Edge test" },
} as const;

describe("Assistant Edge contracts", () => {
  it("cannot drift from the thirteen audited browser commands", () => {
    expect(AUDITED_COMMANDS).toEqual(COMMAND_NAMES);
    for (const command of COMMAND_NAMES) {
      const expected = parseCommandInput(command, samples[command]);
      const answer = parseModelAnswer({ answer: "A grounded answer.", proposals: [{ id: `p-${command}`, command, input: samples[command], rationale: "Useful scene action." }] });
      expect(answer.proposals[0].input).toEqual(expected);
    }
    const proposalsSchema = OPENROUTER_RESPONSE_FORMAT.json_schema.schema.properties.proposals as {
      items: { anyOf: Array<{ properties: { command: { const: string } } }> };
    };
    const schemaCommands = proposalsSchema.items.anyOf.map((variant) => variant.properties.command.const);
    expect(schemaCommands).toEqual(COMMAND_NAMES);
    const inspectStrictObjects = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "object") {
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
        expect(node.additionalProperties).toBe(false);
      }
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(inspectStrictObjects);
        else inspectStrictObjects(child);
      }
    };
    inspectStrictObjects(OPENROUTER_RESPONSE_FORMAT.json_schema.schema);
  });

  it("requires UUID project ownership inputs and strict request properties", () => {
    const request = parseEdgeAssistantRequest({ requestId: "req-1", projectId: "a0000000-0000-4000-8000-000000000001", message: "Explain this structure." });
    expect(request.projectId).toMatch(/^a000/);
    expect(() => parseEdgeAssistantRequest({ ...request, projectId: "not-a-project" })).toThrow(/UUID/);
    expect(() => parseEdgeAssistantRequest({ ...request, secret: true })).toThrow(/unsupported/);
  });

  it("rejects unaudited or excessive proposals and emits strict SSE", () => {
    expect(() => parseModelAnswer({ answer: "No.", proposals: [{ id: "x", command: "dock_ligand", input: {}, rationale: "No." }] })).toThrow(/unaudited/);
    expect(() => parseModelAnswer({ answer: "No.", proposals: Array.from({ length: 4 }, (_, index) => ({ id: String(index), command: "get_structure_summary", input: {}, rationale: "No." })) })).toThrow(/at most three/);
    expect(sse("done", { interrupted: false })).toBe('event: done\ndata: {"type":"done","interrupted":false}\n\n');
  });

  it("validates OpenRouter structured output before returning proposals", async () => {
    const content = JSON.stringify({ answer: "The surface is a visual overlay.", proposals: [{ id: "surface", command: "show_surface", input: { visible: true, opacity: 0.55 }, rationale: "Inspect the envelope." }] });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response([
        `data: ${JSON.stringify({ id: "provider-request", choices: [{ delta: { content } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, cost: 0.001 } })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    });
    const result = await requestOpenRouter({ apiKey: "server-only", model: "test/model", prompt: "grounded", fetchImpl: fetchImpl as typeof fetch });
    expect(result.proposals[0]).toMatchObject({ command: "show_surface", input: { opacity: 0.55 } });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 8, totalTokens: 18, costUsd: 0.001 });
    expect(result.providerRequestId).toBe("provider-request");
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer server-only");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({ stream: true, usage: { include: true }, max_completion_tokens: 1200, provider: { require_parameters: true } });
    expect(body).not.toHaveProperty("temperature");
  });
});
