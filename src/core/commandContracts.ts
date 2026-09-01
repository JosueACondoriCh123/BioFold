import { AMINO_ACID_CODES } from "./mutations";
import type {
  AtomRef,
  ColorScheme,
  CommandInput,
  CommandName,
  RepresentationStyle,
  ResidueRef,
} from "../types/domain";

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface CommandContract<K extends CommandName> {
  name: K;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  parseInput: (input: unknown) => CommandInput<K>;
}

export class CommandValidationError extends Error {
  readonly code = "INVALID_INPUT" as const;
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "CommandValidationError";
  }
}

function strictRecord(
  input: unknown,
  allowedKeys: readonly string[],
  label = "Tool input",
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CommandValidationError(`${label} must be an object.`);
  }
  const record = input as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new CommandValidationError(
      `${label} contains unsupported ${unexpected.length === 1 ? "property" : "properties"}: ${unexpected.join(", ")}.`,
    );
  }
  return record;
}

function parseResidue(input: unknown, label = "Residue"): ResidueRef {
  const record = strictRecord(input, ["chain", "residueNumber", "insertionCode"], label);
  const chain = typeof record.chain === "string" ? record.chain.trim().toUpperCase() : "";
  const residueNumber = record.residueNumber;
  const insertionCode =
    typeof record.insertionCode === "string" && record.insertionCode.trim()
      ? record.insertionCode.trim().toUpperCase()
      : undefined;

  if (!chain || chain.length > 4 || typeof residueNumber !== "number" || !Number.isInteger(residueNumber)) {
    throw new CommandValidationError(
      `${label} needs a chain of up to four characters and an integer residueNumber.`,
    );
  }
  if (insertionCode && insertionCode.length > 2) {
    throw new CommandValidationError(`${label} insertionCode must contain at most two characters.`);
  }
  return { chain, residueNumber, insertionCode };
}

function parseAtom(input: unknown, label: string): AtomRef {
  const record = strictRecord(
    input,
    ["chain", "residueNumber", "insertionCode", "atomName"],
    label,
  );
  const residue = parseResidue(
    {
      chain: record.chain,
      residueNumber: record.residueNumber,
      ...(record.insertionCode === undefined ? {} : { insertionCode: record.insertionCode }),
    },
    label,
  );
  const atomName = typeof record.atomName === "string" ? record.atomName.trim().toUpperCase() : "";
  if (!atomName || atomName.length > 4) {
    throw new CommandValidationError(`${label} needs an atomName of up to four characters.`);
  }
  return { ...residue, atomName };
}

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

function contract<K extends CommandName>(value: CommandContract<K>): CommandContract<K> {
  return value;
}

export const COMMAND_NAMES = [
  "load_structure",
  "get_structure_summary",
  "focus_residues",
  "set_representation",
  "show_surface",
  "measure_distance",
  "preview_mutation_context",
  "reset_workspace",
] as const satisfies readonly CommandName[];

export const COMMAND_CONTRACTS: { [K in CommandName]: CommandContract<K> } = {
  load_structure: contract({
    name: "load_structure",
    title: "Load protein structure",
    description:
      "Load a four-character PDB structure ID into BioFold's shared 3D workspace. This changes the visible model and may fetch public RCSB data.",
    inputSchema: {
      type: "object",
      properties: {
        pdbId: {
          type: "string",
          pattern: "^[A-Za-z0-9]{4}$",
          description: "Four-character PDB ID, such as 1CRN or 4HHB.",
        },
      },
      required: ["pdbId"],
      additionalProperties: false,
    },
    annotations: { openWorldHint: true },
    parseInput(input) {
      const record = strictRecord(input, ["pdbId"]);
      const pdbId = typeof record.pdbId === "string" ? record.pdbId.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{4}$/.test(pdbId)) {
        throw new CommandValidationError("Use a four-character PDB ID, for example 1CRN or 4HHB.");
      }
      return { pdbId };
    },
  }),
  get_structure_summary: contract({
    name: "get_structure_summary",
    title: "Inspect structure summary",
    description:
      "Read calculated chain, residue, atom, ligand, and water counts for the structure currently visible in BioFold.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
    parseInput(input) {
      strictRecord(input, []);
      return {};
    },
  }),
  focus_residues: contract({
    name: "focus_residues",
    title: "Focus residues",
    description:
      "Highlight and zoom to one or more residues in the current 3D structure. This changes the visible selection.",
    inputSchema: {
      type: "object",
      properties: {
        residues: { type: "array", items: residueSchema, minItems: 1, maxItems: 20 },
        label: { type: "boolean", default: true },
      },
      required: ["residues"],
      additionalProperties: false,
    },
    annotations: {},
    parseInput(input) {
      const record = strictRecord(input, ["residues", "label"]);
      if (!Array.isArray(record.residues) || record.residues.length < 1 || record.residues.length > 20) {
        throw new CommandValidationError("Choose between one and twenty residues.");
      }
      if (record.label !== undefined && typeof record.label !== "boolean") {
        throw new CommandValidationError("label must be true or false.");
      }
      return {
        residues: record.residues.map((residue, index) => parseResidue(residue, `Residue ${index + 1}`)),
        label: record.label === undefined ? true : record.label,
      };
    },
  }),
  set_representation: contract({
    name: "set_representation",
    title: "Set molecular representation",
    description: "Change the visible molecular representation and color scheme for the loaded structure.",
    inputSchema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["cartoon", "stick", "sphere", "line"] },
        colorScheme: { type: "string", enum: ["chain", "spectrum", "element"] },
      },
      required: ["style", "colorScheme"],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
    parseInput(input) {
      const record = strictRecord(input, ["style", "colorScheme"]);
      const styles: RepresentationStyle[] = ["cartoon", "stick", "sphere", "line"];
      const colors: ColorScheme[] = ["chain", "spectrum", "element"];
      if (!styles.includes(record.style as RepresentationStyle) ||
          !colors.includes(record.colorScheme as ColorScheme)) {
        throw new CommandValidationError("Use a supported style and colorScheme.");
      }
      return {
        style: record.style as RepresentationStyle,
        colorScheme: record.colorScheme as ColorScheme,
      };
    },
  }),
  show_surface: contract({
    name: "show_surface",
    title: "Toggle molecular surface",
    description: "Calculate, show, or hide the visible van der Waals surface for the current structure.",
    inputSchema: {
      type: "object",
      properties: {
        visible: { type: "boolean" },
        opacity: { type: "number", minimum: 0.1, maximum: 1, default: 0.72 },
      },
      required: ["visible"],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true },
    parseInput(input) {
      const record = strictRecord(input, ["visible", "opacity"]);
      if (typeof record.visible !== "boolean") {
        throw new CommandValidationError("visible must be true or false.");
      }
      const opacity = record.opacity === undefined ? 0.72 : record.opacity;
      if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) {
        throw new CommandValidationError("opacity must be between 0.1 and 1.");
      }
      return { visible: record.visible, opacity };
    },
  }),
  measure_distance: contract({
    name: "measure_distance",
    title: "Measure atomic distance",
    description:
      "Calculate the Euclidean distance in angstroms between two unambiguous atoms and draw it in the shared 3D view.",
    inputSchema: {
      type: "object",
      properties: { from: atomSchema, to: atomSchema },
      required: ["from", "to"],
      additionalProperties: false,
    },
    annotations: {},
    parseInput(input) {
      const record = strictRecord(input, ["from", "to"]);
      return { from: parseAtom(record.from, "from"), to: parseAtom(record.to, "to") };
    },
  }),
  preview_mutation_context: contract({
    name: "preview_mutation_context",
    title: "Preview mutation context",
    description:
      "Highlight residues within 5 angstroms of a selected amino acid and compare coarse charge, size, and hydrophobicity classes. This is a labeled heuristic, not a stability or folding prediction.",
    inputSchema: {
      type: "object",
      properties: {
        residue: residueSchema,
        toAminoAcid: { type: "string", enum: AMINO_ACID_CODES },
      },
      required: ["residue", "toAminoAcid"],
      additionalProperties: false,
    },
    annotations: {},
    parseInput(input) {
      const record = strictRecord(input, ["residue", "toAminoAcid"]);
      const toAminoAcid =
        typeof record.toAminoAcid === "string" ? record.toAminoAcid.trim().toUpperCase() : "";
      if (!AMINO_ACID_CODES.includes(toAminoAcid)) {
        throw new CommandValidationError(
          "toAminoAcid must be a standard one-letter amino-acid code.",
        );
      }
      return { residue: parseResidue(record.residue), toAminoAcid };
    },
  }),
  reset_workspace: contract({
    name: "reset_workspace",
    title: "Reset molecular workspace",
    description:
      "Reset only visual styles and overlays, or clear the complete loaded structure. Use scope view to preserve the model and scope all to clear it.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", enum: ["view", "all"] } },
      required: ["scope"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, idempotentHint: true },
    parseInput(input) {
      const record = strictRecord(input, ["scope"]);
      if (record.scope !== "view" && record.scope !== "all") {
        throw new CommandValidationError("scope must be either view or all.");
      }
      return { scope: record.scope };
    },
  }),
};

export function parseCommandInput<K extends CommandName>(
  command: K,
  input: unknown,
): CommandInput<K> {
  return COMMAND_CONTRACTS[command].parseInput(input);
}
