import { describe, expect, it } from "vitest";
import {
  COMMAND_CONTRACTS,
  COMMAND_NAMES,
  COMMAND_EXAMPLES,
  CommandValidationError,
  parseCommandInput,
} from "../src/core/commandContracts";

const validInputs = {
  load_structure: { pdbId: " 4hhb " },
  get_structure_summary: {},
  focus_residues: { residues: [{ chain: " a ", residueNumber: 10 }], label: true },
  set_representation: { style: "cartoon", colorScheme: "chain" },
  show_surface: { visible: true, opacity: 0.72 },
  measure_distance: {
    from: { chain: "a", residueNumber: 1, atomName: "ca" },
    to: { chain: "a", residueNumber: 10, atomName: "nz" },
  },
  preview_mutation_context: {
    residue: { chain: "a", residueNumber: 10 },
    toAminoAcid: "w",
  },
  reset_workspace: { scope: "view" },
  export_publication_figure: { resolution: "4k", background: "transparent", format: "png" },
  annotate_active_site: {
    chain: "a",
    residueNumber: 41,
    note: "Active site base",
    color: "#5ccfb5",
  },
  query_uniprot_annotations: {
    pdbId: "1crn",
    highlightInViewer: true,
  },
  compare_structures_rmsd: {
    referencePdbId: "6lu7",
    mobilePdbId: "1crn",
  },
  save_project_snapshot: {
    title: "Test Snapshot",
    description: "Contract test",
  },
} as const;

describe("command contracts", () => {
  it("publishes valid copyable examples for every Inspector tool", () => {
    for (const name of COMMAND_NAMES) {
      expect(COMMAND_CONTRACTS[name].inputSchema.examples).toEqual([COMMAND_EXAMPLES[name]]);
      expect(() => parseCommandInput(name, COMMAND_EXAMPLES[name])).not.toThrow();
    }
  });

  it("rejects the actual Inspector placeholders with a field-specific explanation", () => {
    expect(() => parseCommandInput("load_structure", { pdbId: "example_string" })).toThrow(/pdbId.*1CRN.*example_string/);
    expect(() => parseCommandInput("focus_residues", { residues: [{ chain: "example_string", residueNumber: 0, insertionCode: "example_string" }] })).toThrow(/Residue 1.chain.*example_string/);
    expect(() => parseCommandInput("measure_distance", { from: { chain: "example_string", residueNumber: 0, atomName: "example_string" }, to: COMMAND_EXAMPLES.measure_distance.to })).toThrow(/from.chain/);
    expect(() => parseCommandInput("preview_mutation_context", { residue: { chain: "example_string", residueNumber: 0 }, toAminoAcid: "A" })).toThrow(/Residue.chain/);
    expect(() => parseCommandInput("focus_residues", { residues: [{ chain: "A", residueNumber: "10" }] })).toThrow(/without quotes/);
  });

  it("validates IDs and boolean flags in annotation and comparison commands", () => {
    expect(() => parseCommandInput("query_uniprot_annotations", { pdbId: "example_string" })).toThrow(/pdbId/);
    expect(() => parseCommandInput("query_uniprot_annotations", { highlightInViewer: "false" })).toThrow(/highlightInViewer/);
    expect(() => parseCommandInput("compare_structures_rmsd", { mobilePdbId: "example_string" })).toThrow(/mobilePdbId/);
    expect(() => parseCommandInput("compare_structures_rmsd", { mobilePdbId: "1CRN", referencePdbId: 1234 })).toThrow(/referencePdbId/);
  });

  it("defines exactly thirteen strict JSON schemas with behavioral annotations", () => {
    expect(Object.keys(COMMAND_CONTRACTS)).toEqual(COMMAND_NAMES);
    for (const name of COMMAND_NAMES) {
      const contract = COMMAND_CONTRACTS[name];
      expect(contract.name).toBe(name);
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(20);
      expect(contract.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(contract.annotations).toBeTypeOf("object");
    }
    expect(COMMAND_CONTRACTS.get_structure_summary.annotations.readOnlyHint).toBe(true);
    expect(COMMAND_CONTRACTS.load_structure.annotations.openWorldHint).toBe(true);
    expect(COMMAND_CONTRACTS.reset_workspace.annotations.destructiveHint).toBe(true);
    expect(COMMAND_CONTRACTS.export_publication_figure.annotations.readOnlyHint).toBe(true);
    expect(COMMAND_CONTRACTS.compare_structures_rmsd.annotations.readOnlyHint).toBe(true);
  });

  it("parses every valid command and rejects unsupported top-level properties", () => {
    for (const name of COMMAND_NAMES) {
      expect(() => parseCommandInput(name, validInputs[name])).not.toThrow();
      expect(() =>
        parseCommandInput(name, { ...validInputs[name], unsupported: true }),
      ).toThrow(CommandValidationError);
    }
  });

  it("normalizes molecular identifiers at the command boundary", () => {
    expect(parseCommandInput("load_structure", validInputs.load_structure)).toEqual({
      pdbId: "4HHB",
    });
    expect(parseCommandInput("measure_distance", validInputs.measure_distance)).toEqual({
      from: { chain: "A", residueNumber: 1, atomName: "CA", insertionCode: undefined },
      to: { chain: "A", residueNumber: 10, atomName: "NZ", insertionCode: undefined },
    });
    expect(
      parseCommandInput(
        "preview_mutation_context",
        validInputs.preview_mutation_context,
      ),
    ).toMatchObject({
      residue: { chain: "A", residueNumber: 10 },
      toAminoAcid: "W",
    });
  });

  it("enforces nested strictness, residue limits, and surface bounds", () => {
    expect(() =>
      parseCommandInput("focus_residues", {
        residues: [{ chain: "A", residueNumber: 10, unsupported: true }],
      }),
    ).toThrow(/unsupported property/);
    expect(() =>
      parseCommandInput("focus_residues", {
        residues: Array.from({ length: 21 }, (_, index) => ({
          chain: "A",
          residueNumber: index + 1,
        })),
      }),
    ).toThrow(/one and twenty/);
    expect(() =>
      parseCommandInput("show_surface", { visible: true, opacity: 0.05 }),
    ).toThrow(/between 0.1 and 1/);
  });
});
