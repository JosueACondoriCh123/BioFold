import { commandBus } from "../core/commandBus";
import { useAppStore } from "../store/appStore";
import type { CommandName } from "../types/domain";

const residueSchema = {
  type: "object",
  properties: {
    chain: { type: "string", minLength: 1, maxLength: 4 },
    residueNumber: { type: "integer" },
    insertionCode: { type: "string", maxLength: 2 },
  },
  required: ["chain", "residueNumber"],
  additionalProperties: false,
};

const atomSchema = {
  ...residueSchema,
  properties: {
    ...residueSchema.properties,
    atomName: { type: "string", minLength: 1, maxLength: 4 },
  },
  required: ["chain", "residueNumber", "atomName"],
};

function definition(
  name: CommandName,
  title: string,
  description: string,
  inputSchema: Record<string, unknown>,
  readOnlyHint = false,
): WebMCPToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: {
      readOnlyHint,
      destructiveHint: name === "reset_workspace",
      idempotentHint: ["get_structure_summary", "set_representation", "show_surface"].includes(name),
      openWorldHint: name === "load_structure",
    },
    execute: (input, context) =>
      commandBus.execute(name, input, { origin: "agent", signal: context?.signal }),
  };
}

export const BIOFOLD_TOOLS: WebMCPToolDefinition[] = [
  definition(
    "load_structure",
    "Load protein structure",
    "Load a four-character PDB structure ID into BioFold's shared 3D workspace. This changes the visible model and may fetch public RCSB data.",
    {
      type: "object",
      properties: {
        pdbId: { type: "string", pattern: "^[A-Za-z0-9]{4}$", description: "Four-character PDB ID, such as 1CRN or 4HHB." },
      },
      required: ["pdbId"],
      additionalProperties: false,
    },
  ),
  definition(
    "get_structure_summary",
    "Inspect structure summary",
    "Read calculated chain, residue, atom, ligand, and water counts for the structure currently visible in BioFold.",
    { type: "object", properties: {}, additionalProperties: false },
    true,
  ),
  definition(
    "focus_residues",
    "Focus residues",
    "Highlight and zoom to one or more residues in the current 3D structure. This changes the visible selection.",
    {
      type: "object",
      properties: {
        residues: { type: "array", items: residueSchema, minItems: 1, maxItems: 20 },
        label: { type: "boolean", default: true },
      },
      required: ["residues"],
      additionalProperties: false,
    },
  ),
  definition(
    "set_representation",
    "Set molecular representation",
    "Change the visible molecular representation and color scheme for the loaded structure.",
    {
      type: "object",
      properties: {
        style: { type: "string", enum: ["cartoon", "stick", "sphere", "line"] },
        colorScheme: { type: "string", enum: ["chain", "spectrum", "element"] },
      },
      required: ["style", "colorScheme"],
      additionalProperties: false,
    },
  ),
  definition(
    "show_surface",
    "Toggle molecular surface",
    "Calculate, show, or hide the visible van der Waals surface for the current structure.",
    {
      type: "object",
      properties: {
        visible: { type: "boolean" },
        opacity: { type: "number", minimum: 0.1, maximum: 1, default: 0.72 },
      },
      required: ["visible"],
      additionalProperties: false,
    },
  ),
  definition(
    "measure_distance",
    "Measure atomic distance",
    "Calculate the Euclidean distance in angstroms between two unambiguous atoms and draw it in the shared 3D view.",
    {
      type: "object",
      properties: { from: atomSchema, to: atomSchema },
      required: ["from", "to"],
      additionalProperties: false,
    },
  ),
  definition(
    "preview_mutation_context",
    "Preview mutation context",
    "Highlight residues within 5 angstroms of a selected amino acid and compare coarse charge, size, and hydrophobicity classes. This is a labeled heuristic, not a stability or folding prediction.",
    {
      type: "object",
      properties: {
        residue: residueSchema,
        toAminoAcid: { type: "string", enum: ["A", "R", "N", "D", "C", "Q", "E", "G", "H", "I", "L", "K", "M", "F", "P", "S", "T", "W", "Y", "V"] },
      },
      required: ["residue", "toAminoAcid"],
      additionalProperties: false,
    },
  ),
  definition(
    "reset_workspace",
    "Reset molecular workspace",
    "Reset only visual styles and overlays, or clear the complete loaded structure. Use scope view to preserve the model and scope all to clear it.",
    {
      type: "object",
      properties: { scope: { type: "string", enum: ["view", "all"] } },
      required: ["scope"],
      additionalProperties: false,
    },
  ),
];

let registrationPromise: Promise<boolean> | undefined;

export function registerBioFoldTools(modelContext = document.modelContext): Promise<boolean> {
  if (registrationPromise && modelContext === document.modelContext) return registrationPromise;

  const register = async () => {
    if (typeof modelContext?.registerTool !== "function") {
      useAppStore.getState().setWebMcpStatus(false, 0);
      return false;
    }
    await Promise.all(BIOFOLD_TOOLS.map((tool) => modelContext.registerTool(tool)));
    useAppStore.getState().setWebMcpStatus(true, BIOFOLD_TOOLS.length);
    return true;
  };

  const promise = register().catch((error) => {
    console.error("WebMCP registration failed", error);
    useAppStore.getState().setWebMcpStatus(false, 0);
    return false;
  });
  if (modelContext === document.modelContext) registrationPromise = promise;
  return promise;
}
