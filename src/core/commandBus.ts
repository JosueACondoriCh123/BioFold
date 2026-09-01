import { geometryClient } from "../adapters/geometryClient";
import { ViewerPortError, viewerPort, type PreparedStructure } from "../adapters/viewerPort";
import {
  StructureGatewayError,
  structureGateway,
} from "../adapters/structureGateway";
import { CommandValidationError, parseCommandInput } from "./commandContracts";
import { GeometryError, findResidueAtoms } from "./geometry";
import { compareAminoAcids, toOneLetterCode } from "./mutations";
import { useAppStore } from "../store/appStore";
import { combineSignals, workspaceSession } from "./workspaceSession";
import type {
  ActivityEntry,
  CommandContext,
  CommandErrorCode,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandResult,
  MutationPreview,
} from "../types/domain";

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fail<T = unknown>(
  activityId: string,
  code: CommandErrorCode,
  message: string,
  retryable = false,
): CommandResult<T> {
  return {
    ok: false,
    error: { code, message, retryable },
    evidence: "unavailable",
    activityId,
  };
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Cancelled", "AbortError");
  }
}

class CommandBus {
  private activeLoad?: AbortController;
  private activeSurface?: AbortController;

  constructor() {
    workspaceSession.subscribe((next, previous) => {
      if (!next.active || next.identity !== previous.identity) this.cancelPending();
      if (next.identity !== previous.identity) useAppStore.getState().clearSession();
    });
  }

  cancelPending() {
    this.activeLoad?.abort("workspace-inactive");
    this.activeSurface?.abort("workspace-inactive");
    this.activeLoad = undefined;
    this.activeSurface = undefined;
    const state = useAppStore.getState();
    state.setLoading(false);
    if (state.surfaceOperation.status === "loading") state.clearSurfaceError();
  }

  async execute<K extends CommandName>(
    command: K,
    input: CommandInput<K>,
    context: CommandContext = { origin: "human" },
  ): Promise<CommandResult<CommandOutput<K>>> {
    const activityId = makeId();
    const scope = workspaceSession.getSnapshot();
    // Denied/stale calls do not write into another user's activity stream.
    if (!scope.userId) return fail(activityId, "AUTH_REQUIRED", "Sign in to use the laboratory.");
    if (!scope.active || (context.workspaceGeneration !== undefined && context.workspaceGeneration !== scope.generation)) {
      return fail(activityId, "WORKSPACE_INACTIVE", "Open the laboratory and discover its current tools before using this action.");
    }
    if (context.agentKind === "assistant" && context.approvedByUser !== true) {
      return fail(activityId, "INVALID_INPUT", "Assistant actions require explicit user confirmation.");
    }
    const lifetime = combineSignals(scope.signal, context.signal);
    const start = performance.now();
    let result: CommandResult;

    try {
      assertNotAborted(lifetime.signal);
      if (!viewerPort.isReady()) {
        result = fail(activityId, "RENDER_FAILED", "The 3D viewer is still starting. Try again shortly.", true);
      } else {
        result = await this.dispatch(command, input, activityId, lifetime.signal);
      }
    } catch (error) {
      result = this.normalizeError(activityId, lifetime.signal.aborted
        ? new DOMException("Cancelled", "AbortError") : error);
    } finally {
      lifetime.dispose();
    }

    if (workspaceSession.getSnapshot().identity !== scope.identity) {
      return fail(activityId, "CANCELLED", "The session ended before the operation completed.", true);
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
      agentKind: context.agentKind,
      approvedByUser: context.approvedByUser,
      sourceMessageId: context.sourceMessageId,
    };
    useAppStore.getState().addActivity(entry);
    if (workspaceSession.getSnapshot().generation === scope.generation) useAppStore.getState().setError(
      result.ok || result.error?.code === "CANCELLED" ? undefined : result.error?.message,
    );
    return result as CommandResult<CommandOutput<K>>;
  }

  private async dispatch(
    command: CommandName,
    input: unknown,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    switch (command) {
      case "load_structure":
        return this.loadStructure(parseCommandInput(command, input), activityId, signal);
      case "get_structure_summary":
        parseCommandInput(command, input);
        return this.getStructureSummary(activityId);
      case "focus_residues":
        return this.focusResidues(parseCommandInput(command, input), activityId);
      case "set_representation":
        return this.setRepresentation(parseCommandInput(command, input), activityId);
      case "show_surface":
        return this.showSurface(parseCommandInput(command, input), activityId, signal);
      case "measure_distance":
        return this.measureDistance(parseCommandInput(command, input), activityId, signal);
      case "preview_mutation_context":
        return this.previewMutation(parseCommandInput(command, input), activityId, signal);
      case "reset_workspace":
        return this.resetWorkspace(parseCommandInput(command, input), activityId);
    }
  }

  private async loadStructure(
    input: CommandInput<"load_structure">,
    activityId: string,
    externalSignal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"load_structure">>> {
    this.activeLoad?.abort("replaced");
    const controller = new AbortController();
    this.activeLoad = controller;
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", forwardAbort, { once: true });
    if (externalSignal?.aborted) forwardAbort();
    useAppStore.getState().setLoading(true);
    let prepared: PreparedStructure | undefined;

    try {
      assertNotAborted(controller.signal);
      const payload = await structureGateway.load(input.pdbId, controller.signal);
      assertNotAborted(controller.signal);
      prepared = viewerPort.prepareStructure(payload.data, payload.format);
      assertNotAborted(controller.signal);
      const summary = await geometryClient.summarize(prepared.atoms, controller.signal);
      assertNotAborted(controller.signal);
      viewerPort.commitStructure(prepared);
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
      if (prepared && !prepared.committed && !prepared.discarded) {
        viewerPort.discardStructure(prepared);
      }
      externalSignal?.removeEventListener("abort", forwardAbort);
      if (this.activeLoad === controller) {
        this.activeLoad = undefined;
        useAppStore.getState().setLoading(false);
      }
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

  private focusResidues(
    input: CommandInput<"focus_residues">,
    activityId: string,
  ): CommandResult<CommandOutput<"focus_residues">> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const residues = input.residues;
    const atoms = viewerPort.getAtoms();
    const missing = residues.find((residue) => findResidueAtoms(atoms, residue).length === 0);
    if (missing) {
      throw new GeometryError(
        "SELECTION_NOT_FOUND",
        `Residue ${missing.chain}:${missing.residueNumber} was not found.`,
      );
    }
    const label = input.label !== false;
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

  private setRepresentation(
    input: CommandInput<"set_representation">,
    activityId: string,
  ): CommandResult<CommandOutput<"set_representation">> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const { style, colorScheme } = input;
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

  private async showSurface(
    input: CommandInput<"show_surface">,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"show_surface">>> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const opacity = input.opacity ?? 0.72;
    const request = { visible: input.visible, opacity };

    this.activeSurface?.abort("replaced");
    const controller = new AbortController();
    this.activeSurface = controller;
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });
    if (signal?.aborted) forwardAbort();
    useAppStore.getState().beginSurfaceUpdate(request);

    try {
      assertNotAborted(controller.signal);
      await new Promise<void>((resolve, reject) => {
        let frame: number | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancelled = () => {
          if (frame !== undefined) cancelAnimationFrame(frame);
          if (timer !== undefined) clearTimeout(timer);
          controller.signal.removeEventListener("abort", cancelled);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const complete = () => {
          controller.signal.removeEventListener("abort", cancelled);
          resolve();
        };
        controller.signal.addEventListener("abort", cancelled, { once: true });
        if (typeof requestAnimationFrame === "function") {
          frame = requestAnimationFrame(complete);
        } else {
          timer = setTimeout(complete, 0);
        }
      });
      assertNotAborted(controller.signal);
      await viewerPort.showSurface(input.visible, opacity, controller.signal);
      assertNotAborted(controller.signal);
      if (this.activeSurface === controller) {
        useAppStore.getState().completeSurfaceUpdate(request);
      }
      return {
        ok: true,
        data: { visible: input.visible, opacity, changedView: true },
        evidence: "calculated",
        provenance: { source: "local-calculation", structureId: structure.id },
        activityId,
      };
    } catch (error) {
      if (this.activeSurface === controller) {
        if (error instanceof DOMException && error.name === "AbortError") {
          useAppStore.getState().clearSurfaceError();
        } else {
          const normalized = this.normalizeError(activityId, error);
          useAppStore.getState().failSurfaceUpdate(
            request,
            normalized.error?.message ?? "The molecular surface could not be rendered.",
          );
        }
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      if (this.activeSurface === controller) this.activeSurface = undefined;
    }
  }

  private async measureDistance(
    input: CommandInput<"measure_distance">,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"measure_distance">>> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const { from, to } = input;
    const measured = await geometryClient.distance(viewerPort.getAtoms(), from, to, signal);
    assertNotAborted(signal);
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

  private async previewMutation(
    input: CommandInput<"preview_mutation_context">,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"preview_mutation_context">>> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const { residue, toAminoAcid } = input;
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
    assertNotAborted(signal);
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

  private resetWorkspace(
    input: CommandInput<"reset_workspace">,
    activityId: string,
  ): CommandResult<CommandOutput<"reset_workspace">> {
    if (input.scope === "view") {
      if (!useAppStore.getState().structure) return this.noStructure(activityId);
      viewerPort.resetView();
      useAppStore.getState().resetViewState();
    } else {
      this.activeLoad?.abort("workspace-reset");
      this.activeSurface?.abort("workspace-reset");
      viewerPort.clear();
      useAppStore.getState().clearWorkspace();
    }
    return {
      ok: true,
      data: { scope: input.scope, changedView: true },
      evidence: "observed",
      activityId,
    };
  }

  private noStructure<T = unknown>(activityId: string): CommandResult<T> {
    return fail(
      activityId,
      "STRUCTURE_NOT_LOADED",
      "Load a structure before using this action.",
      false,
    );
  }

  private normalizeError(activityId: string, error: unknown): CommandResult {
    if (error instanceof CommandValidationError) {
      return fail(activityId, error.code, error.message, error.retryable);
    }
    if (error instanceof StructureGatewayError) {
      return fail(activityId, error.code, error.message, error.retryable);
    }
    if (error instanceof ViewerPortError) {
      return fail(activityId, error.code, error.message, error.code === "RENDER_FAILED");
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
    const payload = data && typeof data === "object" ? data as Record<string, unknown> : undefined;
    switch (command) {
      case "load_structure": return `${payload?.structureId ?? "Structure"} loaded and rendered.`;
      case "get_structure_summary": return "Structure summary inspected.";
      case "focus_residues": return `${Array.isArray(payload?.residues) ? payload.residues.length : 0} residue selection focused.`;
      case "set_representation": return `Representation set to ${payload?.style}.`;
      case "show_surface": return payload?.visible ? "Molecular surface shown." : "Molecular surface hidden.";
      case "measure_distance": return `Distance measured: ${Number(payload?.angstroms).toFixed(2)} Å.`;
      case "preview_mutation_context": return `Mutation context mapped with ${payload?.neighborCount ?? 0} nearby residues.`;
      case "reset_workspace": return `Workspace reset (${payload?.scope}).`;
    }
  }
}

export const commandBus = new CommandBus();
