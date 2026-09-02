import { describe, expect, it, vi } from "vitest";
import { COMMAND_NAMES, parseCommandInput } from "../src/core/commandContracts";
import { AUDITED_COMMANDS, parseEdgeAssistantRequest, parseModelAnswer, sse } from "../supabase/functions/_shared/assistantProtocol";
import { requestOpenRouter } from "../supabase/functions/_shared/openRouter";

const samples = {
  load_structure: { pdbId: "4hhb" },
  get_structure_summary: {},
  focus_residues: { residues: [{ chain: "a", residueNumber: 10 }], label: true },
  set_representation: { style: "stick", colorScheme: "spectrum" },
  show_surface: { visible: true, opacity: 0.55 },
  measure_distance: { from: { chain: "A", residueNumber: 1, atomName: "ca" }, to: { chain: "A", residueNumber: 10, atomName: "CA" } },
  preview_mutation_context: { residue: { chain: "A", residueNumber: 10 }, toAminoAcid: "w" },
  reset_workspace: { scope: "view" },
} as const;

describe("Assistant Edge contracts", () => {
  it("cannot drift from the eight audited browser commands", () => {
    expect(AUDITED_COMMANDS).toEqual(COMMAND_NAMES);
    for (const command of COMMAND_NAMES) {
      const expected = parseCommandInput(command, samples[command]);
      const answer = parseModelAnswer({ answer: "A grounded answer.", proposals: [{ id: `p-${command}`, command, input: samples[command], rationale: "Useful scene action." }] });
      expect(answer.proposals[0].input).toEqual(expected);
    }
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
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({
      choices: [{ message: { content: JSON.stringify({ answer: "The surface is a visual overlay.", proposals: [{ id: "surface", command: "show_surface", input: { visible: true, opacity: 0.55 }, rationale: "Inspect the envelope." }] }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18, cost: 0.001 },
      });
    });
    const result = await requestOpenRouter({ apiKey: "server-only", model: "test/model", prompt: "grounded", fetchImpl: fetchImpl as typeof fetch });
    expect(result.proposals[0]).toMatchObject({ command: "show_surface", input: { opacity: 0.55 } });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 8, totalTokens: 18, costUsd: 0.001 });
    const headers = fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer server-only");
  });
});
