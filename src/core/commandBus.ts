import { geometryClient } from "../adapters/geometryClient";
import { viewerPort } from "../adapters/viewerPort";
import {
  StructureGatewayError,
  structureGateway,
} from "../adapters/structureGateway";
import { GeometryError, findResidueAtoms } from "./geometry";
import { AMINO_ACID_CODES, compareAminoAcids, toOneLetterCode } from "./mutations";
import { useAppStore } from "../store/appStore";
import type {
  ActivityEntry,
  AtomRef,
  ColorScheme,
  CommandContext,
  CommandErrorCode,
  CommandName,
  CommandResult,
  MutationPreview,
  RepresentationStyle,
  ResidueRef,
} from "../types/domain";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fail(
  activityId: string,
  code: CommandErrorCode,
  message: string,
  retryable = false,
): CommandResult {
  return {
    ok: false,
    error: { code, message, retryable },
    evidence: "unavailable",
    activityId,
  };
}

function requireRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StructureGatewayError("INVALID_INPUT", "Tool input must be an object.", false);
  }
  return input as Record<string, unknown>;
}

function parseResidue(input: unknown): ResidueRef {
  const record = requireRecord(input);
  const chain = typeof record.chain === "string" ? record.chain.trim() : "";
  const residueNumber = Number(record.residueNumber);
  const insertionCode =
    typeof record.insertionCode === "string" && record.insertionCode.trim()
      ? record.insertionCode.trim()
      : undefined;
  if (!chain || !Number.isInteger(residueNumber)) {
    throw new StructureGatewayError(
      "INVALID_INPUT",
      "A residue needs a chain and integer residueNumber.",
      false,
    );
  }
  return { chain, residueNumber, insertionCode };
}

function parseAtom(input: unknown): AtomRef {
  const residue = parseResidue(input);
  const record = input as Record<string, unknown>;
  const atomName = typeof record.atomName === "string" ? record.atomName.trim().toUpperCase() : "";
  if (!atomName || atomName.length > 4) {
    throw new StructureGatewayError(
      "INVALID_INPUT",
      "An atom selector needs a valid atomName such as CA or NZ.",
      false,
    );
  }
  return { ...residue, atomName };
}

class CommandBus {
  private activeLoad?: AbortController;

  async execute(
    command: CommandName,
    input: unknown = {},
    context: CommandContext = { origin: "human" },
  ): Promise<CommandResult> {
    const activityId = makeId();
    const start = performance.now();
    let result: CommandResult;

    try {
      if (!viewerPort.isReady()) {
        result = fail(activityId, "RENDER_FAILED", "The 3D viewer is still starting. Try again shortly.", true);
      } else {
        result = await this.dispatch(command, input, activityId, context.signal);
      }
    } catch (error) {
      result = this.normalizeError(activityId, error);
    }

    const durationMs = Math.round(performance.now() - start);
    const entry: ActivityEntry = {
      id: activityId,
      command,
      origin: context.origin,
      status: result.ok ? "success" : "error",
      message: result.ok ? this.successMessage(command, result.data) : result.error!.message,
      createdAt: new Date().toISOString(),
      durationMs,
    };
    useAppStore.getState().addActivity(entry);
    useAppStore.getState().setError(result.ok ? undefined : result.error?.message);
    return result;
  }

  private async dispatch(
    command: CommandName,
    input: unknown,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    switch (command) {
      case "load_structure":
        return this.loadStructure(input, activityId, signal);
      case "get_structure_summary":
        return this.getStructureSummary(activityId);
      case "focus_residues":
        return this.focusResidues(input, activityId);
      case "set_representation":
        return this.setRepresentation(input, activityId);
      case "show_surface":
        return this.showSurface(input, activityId);
      case "measure_distance":
        return this.measureDistance(input, activityId, signal);
      case "preview_mutation_context":
        return this.previewMutation(input, activityId, signal);
      case "reset_workspace":
        return this.resetWorkspace(input, activityId);
    }
  }

  private async loadStructure(input: unknown, activityId: string, externalSignal?: AbortSignal) {
    const record = requireRecord(input);
    this.activeLoad?.abort("replaced");
    const controller = new AbortController();
    this.activeLoad = controller;
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", forwardAbort, { once: true });
    useAppStore.getState().setLoading(true);

    try {
      const payload = await structureGateway.load(record.pdbId, controller.signal);
      viewerPort.load(payload.data, payload.format);
      const atoms = viewerPort.getAtoms();
      const summary = await geometryClient.summarize(atoms, controller.signal);
      useAppStore.getState().setStructure(
        {
          id: payload.id,
          source: payload.source,
          format: payload.format,
          loadedAt: new Date().toISOString(),
        },
        summary,
      );
      return {
        ok: true,
        data: { structureId: payload.id, source: payload.source, summary },
        evidence: "observed",
        provenance: { source: payload.source, structureId: payload.id },
        activityId,
      } satisfies CommandResult;
    } finally {
      externalSignal?.removeEventListener("abort", forwardAbort);
      if (this.activeLoad === controller) this.activeLoad = undefined;
      useAppStore.getState().setLoading(false);
    }
  }

  private getStructureSummary(activityId: string): CommandResult {
    const state = useAppStore.getState();
    if (!state.structure || !state.summary) return this.noStructure(activityId);
    return {
      ok: true,
      data: state.summary,
      evidence: "calculated",
      provenance: { source: "local-calculation", structureId: state.structure.id },
      activityId,
    };
  }

  private focusResidues(input: unknown, activityId: string): CommandResult {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const record = requireRecord(input);
    if (!Array.isArray(record.residues) || record.residues.length < 1 || record.residues.length > 20) {
      throw new StructureGatewayError(
        "INVALID_INPUT",
        "Choose between one and twenty residues.",
        false,
      );
    }
    const residues = record.residues.map(parseResidue);
    const atoms = viewerPort.getAtoms();
    const missing = residues.find((residue) => findResidueAtoms(atoms, residue).length === 0);
    if (missing) {
      throw new GeometryError(
        "SELECTION_NOT_FOUND",
        `Residue ${missing.chain}:${missing.residueNumber} was not found.`,
      );
    }
    const label = record.label !== false;
    viewerPort.focusResidues(residues, label);
    const state = useAppStore.getState();
    state.setSelection(residues);
    state.setMeasurement(undefined);
    state.setMutation(undefined);
    return {
      ok: true,
      data: { residues, label, changedView: true },
      evidence: "observed",
      provenance: { source: structure.source, structureId: structure.id },
      activityId,
    };
  }

  private setRepresentation(input: unknown, activityId: string): CommandResult {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const record = requireRecord(input);
    const styles: RepresentationStyle[] = ["cartoon", "stick", "sphere", "line"];
    const colors: ColorScheme[] = ["chain", "spectrum", "element"];
    if (!styles.includes(record.style as RepresentationStyle) ||
        !colors.includes(record.colorScheme as ColorScheme)) {
      throw new StructureGatewayError(
        "INVALID_INPUT",
        "Use a supported style and colorScheme.",
        false,
      );
    }
    const style = record.style as RepresentationStyle;
    const colorScheme = record.colorScheme as ColorScheme;
    viewerPort.setRepresentation(style, colorScheme);
    useAppStore.getState().setRepresentation(style, colorScheme);
    return {
      ok: true,
      data: { style, colorScheme, changedView: true },
      evidence: "observed",
      provenance: { source: structure.source, structureId: structure.id },
      activityId,
    };
  }

  private async showSurface(input: unknown, activityId: string): Promise<CommandResult> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const record = requireRecord(input);
    if (typeof record.visible !== "boolean") {
      throw new StructureGatewayError("INVALID_INPUT", "visible must be true or false.", false);
    }
    const opacity = record.opacity === undefined ? 0.72 : Number(record.opacity);
    if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) {
      throw new StructureGatewayError("INVALID_INPUT", "opacity must be between 0.1 and 1.", false);
    }
    await viewerPort.showSurface(record.visible, opacity);
    useAppStore.getState().setSurface(record.visible, opacity);
    return {
      ok: true,
      data: { visible: record.visible, opacity, changedView: true },
      evidence: "calculated",
      provenance: { source: "local-calculation", structureId: structure.id },
      activityId,
    };
  }

  private async measureDistance(input: unknown, activityId: string, signal?: AbortSignal): Promise<CommandResult> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const record = requireRecord(input);
    const from = parseAtom(record.from);
    const to = parseAtom(record.to);
    const measured = await geometryClient.distance(viewerPort.getAtoms(), from, to, signal);
    viewerPort.showDistance(measured.fromAtom, measured.toAtom, measured.angstroms);
    const measurement = { from, to, angstroms: measured.angstroms };
    const state = useAppStore.getState();
    state.setMeasurement(measurement);
    state.setMutation(undefined);
    return {
      ok: true,
      data: { ...measurement, units: "angstrom", changedView: true },
      evidence: "calculated",
      provenance: { source: "local-calculation", structureId: structure.id },
      activityId,
    };
  }

  private async previewMutation(input: unknown, activityId: string, signal?: AbortSignal): Promise<CommandResult> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const record = requireRecord(input);
    const residue = parseResidue(record.residue);
    const toAminoAcid =
      typeof record.toAminoAcid === "string" ? record.toAminoAcid.trim().toUpperCase() : "";
    if (!AMINO_ACID_CODES.includes(toAminoAcid)) {
      throw new StructureGatewayError(
        "INVALID_INPUT",
        "toAminoAcid must be a standard one-letter amino-acid code.",
        false,
      );
    }
    const atoms = viewerPort.getAtoms();
    const targetAtoms = findResidueAtoms(atoms, residue);
    if (targetAtoms.length === 0) {
      throw new GeometryError(
        "SELECTION_NOT_FOUND",
        `Residue ${residue.chain}:${residue.residueNumber} was not found.`,
      );
    }
    const originalAminoAcid = toOneLetterCode(targetAtoms[0].residueName);
    if (!originalAminoAcid) {
      throw new StructureGatewayError(
        "INVALID_INPUT",
        "The selected residue is not a standard amino acid.",
        false,
      );
    }
    const neighbors = await geometryClient.neighbors(atoms, residue, 5, signal);
    const heuristics = compareAminoAcids(originalAminoAcid, toAminoAcid);
    const preview: MutationPreview = {
      residue,
      originalAminoAcid,
      targetAminoAcid: toAminoAcid,
      neighbors,
      heuristics,
      disclaimer:
        "Context-only heuristic. BioFold does not alter coordinates or predict stability, folding, or pathogenicity.",
    };
    viewerPort.previewMutation(residue, neighbors);
    const state = useAppStore.getState();
    state.setMutation(preview);
    state.setMeasurement(undefined);
    state.setSelection([residue]);
    return {
      ok: true,
      data: { ...preview, neighborCount: neighbors.length, changedView: true },
      evidence: "heuristic",
      provenance: { source: "local-calculation", structureId: structure.id },
      activityId,
    };
  }

  private resetWorkspace(input: unknown, activityId: string): CommandResult {
    const record = requireRecord(input);
    if (record.scope !== "view" && record.scope !== "all") {
      throw new StructureGatewayError(
        "INVALID_INPUT",
        "scope must be either view or all.",
        false,
      );
    }
    if (record.scope === "view") {
      if (!useAppStore.getState().structure) return this.noStructure(activityId);
      viewerPort.resetView();
      useAppStore.getState().resetViewState();
    } else {
      this.activeLoad?.abort("workspace-reset");
      viewerPort.clear();
      useAppStore.getState().clearWorkspace();
    }
    return {
      ok: true,
      data: { scope: record.scope, changedView: true },
      evidence: "observed",
      activityId,
    };
  }

  private noStructure(activityId: string): CommandResult {
    return fail(
      activityId,
      "STRUCTURE_NOT_LOADED",
      "Load a structure before using this action.",
      false,
    );
  }

  private normalizeError(activityId: string, error: unknown): CommandResult {
    if (error instanceof StructureGatewayError) {
      return fail(activityId, error.code, error.message, error.retryable);
    }
    if (error instanceof GeometryError) {
      return fail(activityId, error.code, error.message, false);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return fail(activityId, "CANCELLED", "The operation was cancelled.", true);
    }
    return fail(
      activityId,
      "RENDER_FAILED",
      error instanceof Error ? error.message : "The molecular view could not be updated.",
      true,
    );
  }

  private successMessage(command: CommandName, data: unknown): string {
    const payload = data as Record<string, any> | undefined;
    switch (command) {
      case "load_structure": return `${payload?.structureId ?? "Structure"} loaded and rendered.`;
      case "get_structure_summary": return "Structure summary inspected.";
      case "focus_residues": return `${payload?.residues?.length ?? 0} residue selection focused.`;
      case "set_representation": return `Representation set to ${payload?.style}.`;
      case "show_surface": return payload?.visible ? "Molecular surface shown." : "Molecular surface hidden.";
      case "measure_distance": return `Distance measured: ${Number(payload?.angstroms).toFixed(2)} Å.`;
      case "preview_mutation_context": return `Mutation context mapped with ${payload?.neighborCount ?? 0} nearby residues.`;
      case "reset_workspace": return `Workspace reset (${payload?.scope}).`;
    }
  }
}

export const commandBus = new CommandBus();
