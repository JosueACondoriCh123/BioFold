import { COMMAND_CONTRACTS, COMMAND_NAMES } from "../../core/commandContracts";
import type { CommandName } from "../../types/domain";

/**
 * The tool table is derived from the real contracts the agent receives, so the
 * landing page cannot drift away from what BioFold actually registers.
 */
export interface ToolEntry {
  name: CommandName;
  title: string;
  description: string;
  hints: string[];
}

/** MCP annotation hints, rendered with the vocabulary agents actually see. */
function hintsFor(name: CommandName): string[] {
  const { annotations } = COMMAND_CONTRACTS[name];
  const hints: string[] = [];
  if (annotations.readOnlyHint) hints.push("read-only");
  if (annotations.idempotentHint) hints.push("idempotent");
  if (annotations.openWorldHint) hints.push("open-world");
  if (annotations.destructiveHint) hints.push("destructive");
  return hints;
}

export const TOOLS: ToolEntry[] = COMMAND_NAMES.map((name) => ({
  name,
  title: COMMAND_CONTRACTS[name].title,
  description: COMMAND_CONTRACTS[name].description,
  hints: hintsFor(name),
}));

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

/**
 * The tool count is read from the contracts too. Registering another command
 * must never leave the page claiming a number it no longer lists.
 */
export const TOOL_COUNT = TOOLS.length;
export const TOOL_COUNT_WORD = NUMBER_WORDS[TOOL_COUNT] ?? String(TOOL_COUNT);
export const TOOL_COUNT_WORD_CAPS = TOOL_COUNT_WORD.charAt(0).toUpperCase() + TOOL_COUNT_WORD.slice(1);

/** Panels shown over the pinned video stage, in scroll order. */
export interface StagePanel {
  id: string;
  eyebrow: string;
  heading: string;
  body: string;
  aside?: string;
}

export const STAGE_PANELS: StagePanel[] = [
  {
    id: "problem",
    eyebrow: "01 / Why WebMCP",
    heading: "Pixels don't measure ångströms.",
    body: "Screenshot automation collapses inside a WebGL canvas. A vision model cannot pick one atom out of a dense polypeptide chain, hold a camera angle, or read a sub-ångström distance off a render.",
    aside: `${TOOL_COUNT} tools · one command bus · every call audited`,
  },
  {
    id: "bus",
    eyebrow: "02 / Shared control",
    heading: "One command bus.\nTwo kinds of hands.",
    body: "When an agent calls set_representation, it runs the same typed handler your click runs. No DOM scraping, no hidden state, no second code path that drifts out of sync.",
  },
  {
    id: "tools",
    eyebrow: "03 / Typed surface",
    heading: `${TOOL_COUNT_WORD_CAPS} imperative tools,\nregistered on the live scene.`,
    body: "Load a structure, focus residues, compute a surface, measure a distance. Each one is a typed contract with a strict input schema, published through document.modelContext.",
  },
  {
    id: "record",
    eyebrow: "04 / Provenance",
    heading: "Nothing happens off the record.",
    body: "Human or agent, every command lands in the activity stream with a timestamp, a duration and an evidence tag. Assistant proposals stay inert until you press Apply.",
  },
];

export interface Capability {
  title: string;
  body: string;
  detail: string;
  tone?: "rose";
}

export const CAPABILITIES: Capability[] = [
  {
    title: "Find your perspective",
    body: "Move between cartoon, stick, sphere and line views. Color by chain, element or residue spectrum.",
    detail: "Representation & color",
  },
  {
    title: "See the surrounding shape",
    body: "Reveal the molecular surface and adjust its opacity while keeping the underlying structure in view.",
    detail: "Molecular surfaces",
  },
  {
    title: "Make a precise observation",
    body: "Select two atoms and measure their distance in ångströms, with endpoints and references you can inspect.",
    detail: "Distances & selections",
    tone: "rose",
  },
];

export interface EvidenceClass {
  label: string;
  body: string;
  tone?: "amber";
}

export const EVIDENCE_CLASSES: EvidenceClass[] = [
  {
    label: "Observed",
    body: "Coordinates and structure information from RCSB or bundled examples.",
  },
  {
    label: "Calculated",
    body: "Geometric distances and spatial neighbours derived from those coordinates.",
  },
  {
    label: "Heuristic",
    body: "Mutation context compares residue properties. It does not simulate a mutation.",
    tone: "amber",
  },
];

export interface PlatformFact {
  title: string;
  body: string;
}

export const PLATFORM_FACTS: PlatformFact[] = [
  {
    title: "Private by policy",
    body: "Row-level security scopes every project to its owner. The browser cannot write assistant messages or read consumption tables.",
  },
  {
    title: "Durable workspaces",
    body: "Camera, representation, surfaces, selections and measurements persist as versioned snapshots with optimistic revision locking.",
  },
  {
    title: "Real accounts",
    body: "Supabase Auth with PKCE, email verification, Google OAuth and password recovery. No guest mode, no mock login.",
  },
  {
    title: "Off the main thread",
    body: "Surface triangulation and geometry run in dedicated workers, cancellable through abort signals.",
  },
];
