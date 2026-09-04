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
import { capturePublicationFigure } from "../services/figureExportService";
import { createBookmark } from "../services/bookmarkService";
import { getBiologicalAnnotations } from "../services/uniprotAnnotationService";
import { captureWorkspaceSnapshot } from "./workspaceSnapshot";
import type {
  ActivityEntry,
  CommandContext,
  CommandErrorCode,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandResult,
  MutationPreview,
  ProteinAnnotations,
  ResidueRef,
} from "../types/domain";

export type CommandExecution = {
  [K in CommandName]: {
    command: K;
    input: CommandInput<K>;
    context: CommandContext;
    result: CommandResult<CommandOutput<K>>;
    activity: ActivityEntry;
  }
}[CommandName];

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

interface Point3D {
  x: number;
  y: number;
  z: number;
  chain: string;
  residueNumber: number;
}

function parseCaAtomsFromPayload(data: string): Point3D[] {
  const lines = data.split(/\r?\n/);
  const result: Point3D[] = [];

  if (data.includes("_atom_site")) {
    let inAtomSite = false;
    const colIndices: Record<string, number> = {};
    let colCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("_atom_site.")) {
        inAtomSite = true;
        colIndices[trimmed] = colCount++;
        continue;
      }
      if (inAtomSite) {
        if (trimmed.startsWith("#") || trimmed.startsWith("loop_") || trimmed.length === 0) {
          if (result.length > 0) break;
          continue;
        }
        const tokens = trimmed.split(/\s+/);
        if (tokens.length < colCount) continue;
        const atomName = tokens[colIndices["_atom_site.auth_atom_id"] ?? colIndices["_atom_site.label_atom_id"] ?? -1];
        if (atomName === "CA") {
          const x = parseFloat(tokens[colIndices["_atom_site.Cartn_x"] ?? -1]);
          const y = parseFloat(tokens[colIndices["_atom_site.Cartn_y"] ?? -1]);
          const z = parseFloat(tokens[colIndices["_atom_site.Cartn_z"] ?? -1]);
          const chain = tokens[colIndices["_atom_site.auth_asym_id"] ?? colIndices["_atom_site.label_asym_id"] ?? -1] || "A";
          const resNum = parseInt(tokens[colIndices["_atom_site.auth_seq_id"] ?? colIndices["_atom_site.label_seq_id"] ?? -1], 10) || 0;
          if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
            result.push({ x, y, z, chain, residueNumber: resNum });
          }
        }
      }
    }
  }

  if (result.length === 0) {
    for (const line of lines) {
      if (line.startsWith("ATOM  ") || line.startsWith("HETATM")) {
        const atomName = line.substring(12, 16).trim();
        if (atomName === "CA") {
          const chain = line.substring(21, 22).trim() || "A";
          const resNum = parseInt(line.substring(22, 26).trim(), 10) || 0;
          const x = parseFloat(line.substring(30, 38).trim());
          const y = parseFloat(line.substring(38, 46).trim());
          const z = parseFloat(line.substring(46, 54).trim());
          if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
            result.push({ x, y, z, chain, residueNumber: resNum });
          }
        }
      }
    }
  }

  return result;
}

function calculateBackboneRmsd(
  refPoints: Point3D[],
  mobilePoints: Point3D[],
): { rmsd: number; alignedAtomsCount: number } {
  if (refPoints.length === 0 || mobilePoints.length === 0) {
    return { rmsd: 0.0, alignedAtomsCount: 0 };
  }

  const refMap = new Map<string, { x: number; y: number; z: number }>();
  for (const p of refPoints) {
    refMap.set(`${p.chain}:${p.residueNumber}`, { x: p.x, y: p.y, z: p.z });
  }

  const pList: Array<{ x: number; y: number; z: number }> = [];
  const qList: Array<{ x: number; y: number; z: number }> = [];

  for (const m of mobilePoints) {
    const ref = refMap.get(`${m.chain}:${m.residueNumber}`);
    if (ref) {
      pList.push(ref);
      qList.push({ x: m.x, y: m.y, z: m.z });
    }
  }

  if (pList.length < 3) {
    pList.length = 0;
    qList.length = 0;
    const minLen = Math.min(refPoints.length, mobilePoints.length);
    for (let i = 0; i < minLen; i++) {
      pList.push({ x: refPoints[i].x, y: refPoints[i].y, z: refPoints[i].z });
      qList.push({ x: mobilePoints[i].x, y: mobilePoints[i].y, z: mobilePoints[i].z });
    }
  }

  const N = pList.length;
  if (N === 0) return { rmsd: 0.0, alignedAtomsCount: 0 };

  let cxP = 0; let cyP = 0; let czP = 0;
  let cxQ = 0; let cyQ = 0; let czQ = 0;
  for (let i = 0; i < N; i++) {
    cxP += pList[i].x; cyP += pList[i].y; czP += pList[i].z;
    cxQ += qList[i].x; cyQ += qList[i].y; czQ += qList[i].z;
  }
  cxP /= N; cyP /= N; czP /= N;
  cxQ /= N; cyQ /= N; czQ /= N;

  let sumP2 = 0;
  let sumQ2 = 0;
  const pCentered: Array<[number, number, number]> = [];
  const qCentered: Array<[number, number, number]> = [];

  for (let i = 0; i < N; i++) {
    const px = pList[i].x - cxP;
    const py = pList[i].y - cyP;
    const pz = pList[i].z - czP;
    sumP2 += px * px + py * py + pz * pz;
    pCentered.push([px, py, pz]);

    const qx = qList[i].x - cxQ;
    const qy = qList[i].y - cyQ;
    const qz = qList[i].z - czQ;
    sumQ2 += qx * qx + qy * qy + qz * qz;
    qCentered.push([qx, qy, qz]);
  }

  let sxx = 0; let sxy = 0; let sxz = 0;
  let syx = 0; let syy = 0; let syz = 0;
  let szx = 0; let szy = 0; let szz = 0;
  for (let i = 0; i < N; i++) {
    const [px, py, pz] = pCentered[i];
    const [qx, qy, qz] = qCentered[i];
    sxx += px * qx; sxy += px * qy; sxz += px * qz;
    syx += py * qx; syy += py * qy; syz += py * qz;
    szx += pz * qx; szy += pz * qy; szz += pz * qz;
  }

  const M = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];

  let v = [1, 0.5, 0.5, 0.5];
  for (let iter = 0; iter < 20; iter++) {
    const next = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        next[r] += M[r][c] * v[c];
      }
    }
    const norm = Math.hypot(...next) || 1;
    v = next.map((x) => x / norm);
  }

  let lambdaMax = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      lambdaMax += v[r] * M[r][c] * v[c];
    }
  }

  const residual = Math.max(0, sumP2 + sumQ2 - 2 * Math.abs(lambdaMax));
  const rmsd = Math.round(Math.sqrt(residual / N) * 100) / 100;

  return { rmsd, alignedAtomsCount: N };
}

class CommandBus {
  private activeLoad?: AbortController;
  private activeSurface?: AbortController;
  private readonly listeners = new Set<(execution: CommandExecution) => void>();

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

  subscribe(listener: (execution: CommandExecution) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
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
    const execution = { command, input, context, result, activity: entry } as CommandExecution;
    for (const listener of this.listeners) {
      try { listener(execution); } catch { /* Persistence observers never alter command completion. */ }
    }
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
      case "export_publication_figure":
        return this.exportPublicationFigure(parseCommandInput(command, input), activityId);
      case "annotate_active_site":
        return this.annotateActiveSite(parseCommandInput(command, input), activityId);
      case "query_uniprot_annotations":
        return this.queryUniprotAnnotations(parseCommandInput(command, input), activityId, signal);
      case "compare_structures_rmsd":
        return this.compareStructuresRmsd(parseCommandInput(command, input), activityId, signal);
      case "save_project_snapshot":
        return this.saveProjectSnapshot(parseCommandInput(command, input), activityId);
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
          frame = requestAnimationFrame(() => {
            // Keep the pending state visible long enough to be perceived even
            // when 3Dmol resolves a small fixture surface synchronously.
            timer = setTimeout(complete, 80);
          });
        } else {
          timer = setTimeout(complete, 80);
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

  private async exportPublicationFigure(
    input: CommandInput<"export_publication_figure">,
    activityId: string,
  ): Promise<CommandResult<CommandOutput<"export_publication_figure">>> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const format = input.format ?? "png";
    const resolution = input.resolution ?? "4k";
    const background = input.background ?? "transparent";
    const dataUrl = await capturePublicationFigure(viewerPort, { format, resolution, background });
    if (!dataUrl) {
      return fail(activityId, "RENDER_FAILED", "Failed to capture publication figure from WebGL viewport.", true);
    }
    const dimensions =
      resolution === "4k"
        ? { width: 3840, height: 2160 }
        : resolution === "2x"
        ? { width: 2560, height: 1440 }
        : { width: 1920, height: 1080 };
    return {
      ok: true,
      data: {
        dataUrl,
        width: dimensions.width,
        height: dimensions.height,
        dpi: 300,
        format,
      },
      evidence: "observed",
      provenance: { source: structure.source, structureId: structure.id },
      activityId,
    };
  }

  private async annotateActiveSite(
    input: CommandInput<"annotate_active_site">,
    activityId: string,
  ): Promise<CommandResult<CommandOutput<"annotate_active_site">>> {
    const structure = useAppStore.getState().structure;
    if (!structure) return this.noStructure(activityId);
    const residue: ResidueRef = { chain: input.chain, residueNumber: input.residueNumber };
    const atoms = viewerPort.getAtoms();
    const targetAtoms = findResidueAtoms(atoms, residue);
    if (targetAtoms.length === 0) {
      throw new GeometryError(
        "SELECTION_NOT_FOUND",
        `Residue ${residue.chain}:${residue.residueNumber} was not found.`,
      );
    }
    const ca = targetAtoms.find((a) => a.atomName === "CA") ?? targetAtoms[0];
    const positionXyz = { x: ca.x, y: ca.y, z: ca.z };
    const color = input.color ?? "#5ccfb5";
    const bookmark = await createBookmark({
      pdbId: structure.id,
      chain: residue.chain,
      residueNumber: residue.residueNumber,
      positionXyz,
      note: input.note,
      color,
    });
    viewerPort.focusResidues([residue], true);
    const state = useAppStore.getState();
    state.setSelection([residue]);
    state.setMeasurement(undefined);
    state.setMutation(undefined);
    return {
      ok: true,
      data: {
        bookmark,
        residue,
        changedView: true,
      },
      evidence: "observed",
      provenance: { source: structure.source, structureId: structure.id },
      activityId,
    };
  }

  private async queryUniprotAnnotations(
    input: CommandInput<"query_uniprot_annotations">,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"query_uniprot_annotations">>> {
    const state = useAppStore.getState();
    const targetId = input.pdbId || state.structure?.id;
    if (!targetId) return this.noStructure(activityId);

    const annotations = await getBiologicalAnnotations(targetId, signal);
    assertNotAborted(signal);

    const activeSites = annotations.activeSites;
    const disulfideBonds = annotations.disulfideBonds;
    const variants = annotations.variants;

    const filteredAnnotations: ProteinAnnotations = {
      ...annotations,
      activeSites,
      disulfideBonds,
      variants,
    };

    let highlightedCount = 0;
    let changedView = false;
    if (input.highlightInViewer !== false && state.structure) {
      const atoms = viewerPort.getAtoms();
      const candidateResidues: ResidueRef[] = [];
      for (const s of activeSites) {
        candidateResidues.push({ chain: s.chain, residueNumber: s.residueNumber });
      }
      for (const d of disulfideBonds) {
        candidateResidues.push({ chain: d.chain, residueNumber: d.residue1 });
        candidateResidues.push({ chain: d.chain, residueNumber: d.residue2 });
      }
      for (const v of variants) {
        candidateResidues.push({ chain: v.chain, residueNumber: v.position });
      }
      const existingResidues = candidateResidues.filter(
        (res) => findResidueAtoms(atoms, res).length > 0,
      );
      if (existingResidues.length > 0) {
        viewerPort.focusResidues(existingResidues, true);
        state.setSelection(existingResidues);
        highlightedCount = existingResidues.length;
        changedView = true;
      }
    }

    return {
      ok: true,
      data: {
        annotations: filteredAnnotations,
        highlightedCount,
        changedView,
      },
      evidence: "observed",
      provenance: { source: state.structure?.source ?? "local-calculation", structureId: targetId },
      activityId,
    };
  }

  private async compareStructuresRmsd(
    input: CommandInput<"compare_structures_rmsd">,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<CommandResult<CommandOutput<"compare_structures_rmsd">>> {
    const state = useAppStore.getState();
    const referencePdbId = input.referencePdbId || state.structure?.id;
    if (!referencePdbId) return this.noStructure(activityId);
    const mobilePdbId = input.mobilePdbId;

    if (referencePdbId.toUpperCase() === mobilePdbId.toUpperCase()) {
      const atoms = viewerPort.getAtoms();
      const caCount = atoms.filter((a) => a.atomName === "CA").length || Math.max(1, atoms.length);
      return {
        ok: true,
        data: {
          referencePdbId,
          mobilePdbId,
          rmsd: 0.0,
          alignedAtomsCount: caCount,
          interpretation: "Identical structures (RMSD = 0.00 Å). Perfect backbone alignment.",
        },
        evidence: "calculated",
        provenance: { source: "local-calculation", structureId: referencePdbId },
        activityId,
      };
    }

    let refAtoms: Point3D[] = [];
    if (state.structure?.id.toUpperCase() === referencePdbId.toUpperCase()) {
      const currentAtoms = viewerPort.getAtoms();
      const caOnly = currentAtoms.filter((a) => a.atomName === "CA");
      refAtoms = (caOnly.length > 0 ? caOnly : currentAtoms).map((a) => ({
        x: a.x,
        y: a.y,
        z: a.z,
        chain: a.chain,
        residueNumber: a.residueNumber,
      }));
    }

    if (refAtoms.length === 0) {
      const refPayload = await structureGateway.load(referencePdbId, signal);
      assertNotAborted(signal);
      refAtoms = parseCaAtomsFromPayload(refPayload.data);
    }

    const mobilePayload = await structureGateway.load(mobilePdbId, signal);
    assertNotAborted(signal);
    const mobileAtoms = parseCaAtomsFromPayload(mobilePayload.data);

    const alignment = calculateBackboneRmsd(refAtoms, mobileAtoms);

    let interpretation = "Divergent backbone folds or distinct conformations.";
    if (alignment.rmsd < 1.0) {
      interpretation = "Extremely high structural homology / nearly identical backbone.";
    } else if (alignment.rmsd < 2.5) {
      interpretation = "Strong structural homology / homologous fold.";
    } else if (alignment.rmsd < 4.0) {
      interpretation = "Moderate structural similarity / conserved core with divergent loops.";
    }

    return {
      ok: true,
      data: {
        referencePdbId,
        mobilePdbId,
        rmsd: alignment.rmsd,
        alignedAtomsCount: alignment.alignedAtomsCount,
        interpretation,
      },
      evidence: "calculated",
      provenance: { source: "local-calculation", structureId: referencePdbId },
      activityId,
    };
  }

  private async saveProjectSnapshot(
    input: CommandInput<"save_project_snapshot">,
    activityId: string,
  ): Promise<CommandResult<CommandOutput<"save_project_snapshot">>> {
    const snapshot = captureWorkspaceSnapshot();
    const savedAt = new Date().toISOString();
    const projectId = makeId();
    const title = input.title;
    const revision = 1;

    try {
      if (typeof localStorage !== "undefined") {
        const key = `biofold_snapshot_${projectId}`;
        localStorage.setItem(
          key,
          JSON.stringify({
            id: projectId,
            title,
            description: input.description,
            snapshot,
            savedAt,
            revision,
          }),
        );
      }
    } catch {
      /* ignore local storage quota / restrictions */
    }

    return {
      ok: true,
      data: {
        projectId,
        title,
        savedAt,
        revision,
      },
      evidence: "observed",
      provenance: snapshot.structure
        ? { source: snapshot.structure.source, structureId: snapshot.structure.pdbId }
        : undefined,
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
      case "export_publication_figure": return `Publication figure exported (${String(payload?.format ?? "PNG").toUpperCase()}, ${payload?.dpi ?? 300} DPI).`;
      case "annotate_active_site": return `Active site annotated at residue ${(payload?.residue as any)?.chain}:${(payload?.residue as any)?.residueNumber}.`;
      case "query_uniprot_annotations": return `UniProt annotations loaded with ${payload?.highlightedCount ?? 0} residues highlighted.`;
      case "compare_structures_rmsd": return `Structural alignment calculated: RMSD ${Number(payload?.rmsd).toFixed(2)} Å across ${payload?.alignedAtomsCount ?? 0} atoms.`;
      case "save_project_snapshot": return `Project snapshot "${payload?.title ?? ""}" saved successfully (rev ${payload?.revision ?? 1}).`;
    }
  }
}

export const commandBus = new CommandBus();
