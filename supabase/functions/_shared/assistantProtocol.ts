export const AUDITED_COMMANDS = [
  "load_structure",
  "get_structure_summary",
  "focus_residues",
  "set_representation",
  "show_surface",
  "measure_distance",
  "preview_mutation_context",
  "reset_workspace",
] as const;

export interface EdgeAssistantRequest {
  requestId: string;
  projectId: string;
  conversationId?: string;
  message: string;
}

export interface EdgeCommandProposal {
  id: string;
  command: typeof AUDITED_COMMANDS[number];
  input: Record<string, unknown>;
  rationale: string;
}

export interface ModelAnswer {
  answer: string;
  proposals: EdgeCommandProposal[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pdb = /^[A-Z0-9]{4}$/;
const aminoAcids = "ARNDCQEGHILKMFPSTWYV";

function strictRecord(value: unknown, keys: string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new Error(`${label} contains unsupported properties.`);
  return record;
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export function parseEdgeAssistantRequest(value: unknown): EdgeAssistantRequest {
  const input = strictRecord(value, ["requestId", "projectId", "conversationId", "message"], "Assistant request");
  const projectId = requiredText(input.projectId, "projectId", 128);
  if (!uuid.test(projectId)) throw new Error("projectId must be a UUID.");
  const conversationId = input.conversationId === undefined
    ? undefined
    : requiredText(input.conversationId, "conversationId", 128);
  if (conversationId && !uuid.test(conversationId)) throw new Error("conversationId must be a UUID.");
  return {
    requestId: requiredText(input.requestId, "requestId", 128),
    projectId,
    ...(conversationId ? { conversationId } : {}),
    message: requiredText(input.message, "message", 8_000),
  };
}

function parseResidue(value: unknown, label: string) {
  const input = strictRecord(value, ["chain", "residueNumber", "insertionCode"], label);
  const chain = requiredText(input.chain, `${label} chain`, 4).toUpperCase();
  if (typeof input.residueNumber !== "number" || !Number.isInteger(input.residueNumber)) throw new Error(`${label} residueNumber must be an integer.`);
  const insertionCode = input.insertionCode === undefined ? undefined : requiredText(input.insertionCode, `${label} insertionCode`, 2).toUpperCase();
  return { chain, residueNumber: input.residueNumber, ...(insertionCode ? { insertionCode } : {}) };
}

function parseAtom(value: unknown, label: string) {
  const input = strictRecord(value, ["chain", "residueNumber", "insertionCode", "atomName"], label);
  const base = parseResidue({ chain: input.chain, residueNumber: input.residueNumber, ...(input.insertionCode === undefined ? {} : { insertionCode: input.insertionCode }) }, label);
  return { ...base, atomName: requiredText(input.atomName, `${label} atomName`, 4).toUpperCase() };
}

function parseCommandInput(command: EdgeCommandProposal["command"], value: unknown) {
  switch (command) {
    case "load_structure": {
      const input = strictRecord(value, ["pdbId"], "load_structure input");
      const pdbId = requiredText(input.pdbId, "pdbId", 4).toUpperCase();
      if (!pdb.test(pdbId)) throw new Error("pdbId is invalid.");
      return { pdbId };
    }
    case "get_structure_summary":
      strictRecord(value, [], "get_structure_summary input"); return {};
    case "focus_residues": {
      const input = strictRecord(value, ["residues", "label"], "focus_residues input");
      if (!Array.isArray(input.residues) || input.residues.length < 1 || input.residues.length > 20) throw new Error("residues must contain 1–20 references.");
      if (input.label !== undefined && typeof input.label !== "boolean") throw new Error("label must be true or false.");
      return { residues: input.residues.map((item, index) => parseResidue(item, `Residue ${index + 1}`)), label: input.label ?? true };
    }
    case "set_representation": {
      const input = strictRecord(value, ["style", "colorScheme"], "set_representation input");
      if (!["cartoon", "stick", "sphere", "line"].includes(String(input.style))) throw new Error("style is invalid.");
      if (!["chain", "spectrum", "element"].includes(String(input.colorScheme))) throw new Error("colorScheme is invalid.");
      return { style: input.style, colorScheme: input.colorScheme };
    }
    case "show_surface": {
      const input = strictRecord(value, ["visible", "opacity"], "show_surface input");
      if (typeof input.visible !== "boolean" || typeof input.opacity !== "number" || input.opacity < 0.1 || input.opacity > 1) throw new Error("Surface input is invalid.");
      return { visible: input.visible, opacity: input.opacity };
    }
    case "measure_distance": {
      const input = strictRecord(value, ["from", "to"], "measure_distance input");
      return { from: parseAtom(input.from, "from"), to: parseAtom(input.to, "to") };
    }
    case "preview_mutation_context": {
      const input = strictRecord(value, ["residue", "toAminoAcid"], "preview_mutation_context input");
      const toAminoAcid = requiredText(input.toAminoAcid, "toAminoAcid", 1).toUpperCase();
      if (!aminoAcids.includes(toAminoAcid)) throw new Error("toAminoAcid must be a standard one-letter code.");
      return { residue: parseResidue(input.residue, "residue"), toAminoAcid };
    }
    case "reset_workspace": {
      const input = strictRecord(value, ["scope"], "reset_workspace input");
      if (input.scope !== "view" && input.scope !== "all") throw new Error("scope is invalid.");
      return { scope: input.scope };
    }
  }
}

export function parseModelAnswer(value: unknown): ModelAnswer {
  const record = strictRecord(value, ["answer", "proposals"], "Model answer");
  if (typeof record.answer !== "string" || !record.answer.trim() || record.answer.length > 8_000) throw new Error("answer is invalid.");
  const answer = record.answer;
  if (!Array.isArray(record.proposals) || record.proposals.length > 3) throw new Error("The model may propose at most three commands.");
  const proposals = record.proposals.map((candidate, index): EdgeCommandProposal => {
    const proposal = strictRecord(candidate, ["id", "command", "input", "rationale"], `Proposal ${index + 1}`);
    const command = requiredText(proposal.command, "command", 64) as EdgeCommandProposal["command"];
    if (!(AUDITED_COMMANDS as readonly string[]).includes(command)) throw new Error("The model proposed an unaudited command.");
    return {
      id: requiredText(proposal.id, "proposal id", 128),
      command,
      input: parseCommandInput(command, proposal.input),
      rationale: requiredText(proposal.rationale, "rationale", 1_000),
    };
  });
  return { answer, proposals };
}

export function sse(type: string, payload: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...(payload as object) })}\n\n`;
}
