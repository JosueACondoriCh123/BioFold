import { viewerPort } from "../adapters/viewerPort";
import type { ActivityEntry, CommandResult } from "../types/domain";
import type { ProjectEventDraft, ProjectEventRecord, WorkspaceSnapshotV1 } from "../types/projects";
import { commandBus, type CommandExecution } from "./commandBus";

function ensureRestored(result: CommandResult, signal?: AbortSignal) {
  if (signal?.aborted || result.error?.code === "CANCELLED") {
    throw new DOMException("Project restoration was cancelled.", "AbortError");
  }
  if (!result.ok) throw new Error(result.error?.message ?? "The saved project could not be restored.");
}

/** Replays only audited commands, then restores the exact confirmed camera. */
export async function restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshotV1, signal?: AbortSignal) {
  const context = { origin: "human" as const, signal };
  if (!snapshot.structure) {
    ensureRestored(await commandBus.execute("reset_workspace", { scope: "all" }, context), signal);
    return;
  }

  ensureRestored(await commandBus.execute(
    "load_structure",
    { pdbId: snapshot.structure.pdbId },
    context,
  ), signal);
  ensureRestored(await commandBus.execute(
    "set_representation",
    { style: snapshot.view.representation, colorScheme: snapshot.view.colorScheme },
    context,
  ), signal);
  ensureRestored(await commandBus.execute(
    "show_surface",
    { visible: snapshot.surface.visible, opacity: snapshot.surface.opacity },
    context,
  ), signal);

  if (snapshot.selectedResidues.length > 0 && !snapshot.measurement && !snapshot.mutation) {
    ensureRestored(await commandBus.execute(
      "focus_residues",
      { residues: snapshot.selectedResidues, label: true },
      context,
    ), signal);
  }
  if (snapshot.measurement) {
    ensureRestored(await commandBus.execute("measure_distance", {
      from: snapshot.measurement.from,
      to: snapshot.measurement.to,
    }, context), signal);
  } else if (snapshot.mutation) {
    ensureRestored(await commandBus.execute("preview_mutation_context", {
      residue: snapshot.mutation.residue,
      toAminoAcid: snapshot.mutation.targetAminoAcid,
    }, context), signal);
  }
  if (snapshot.view.camera) {
    try {
      viewerPort.setView(snapshot.view.camera);
    } catch {
      viewerPort.resetView();
    }
  }
}

export function executionToProjectEvent(execution: CommandExecution): ProjectEventDraft {
  return {
    activityId: execution.activity.id,
    command: execution.command,
    origin: execution.activity.origin,
    ...(execution.activity.agentKind ? { agentKind: execution.activity.agentKind } : {}),
    ...(execution.activity.approvedByUser !== undefined ? { approvedByUser: execution.activity.approvedByUser } : {}),
    ...(execution.activity.sourceMessageId ? { sourceMessageId: execution.activity.sourceMessageId } : {}),
    status: execution.activity.status,
    evidence: execution.result.evidence,
    ...(execution.result.provenance ? { provenance: execution.result.provenance } : {}),
    input: execution.input,
    ...(execution.result.data === undefined ? {} : { output: execution.result.data }),
    ...(execution.result.error ? { error: execution.result.error } : {}),
    durationMs: execution.activity.durationMs,
    createdAt: execution.activity.createdAt,
  } as ProjectEventDraft;
}

export function projectEventToActivity(event: ProjectEventRecord): ActivityEntry {
  const annotationMessage = event.command === "query_uniprot_annotations" && event.output && "message" in event.output
    && typeof event.output.message === "string" ? event.output.message : undefined;
  return {
    id: event.activityId,
    command: event.command,
    origin: event.origin,
    status: event.status,
    message: event.error?.message ?? annotationMessage ?? `Saved ${event.command.replaceAll("_", " ")} completed.`,
    createdAt: event.createdAt,
    durationMs: event.durationMs,
    agentKind: event.agentKind,
    approvedByUser: event.approvedByUser,
    sourceMessageId: event.sourceMessageId,
  };
}
