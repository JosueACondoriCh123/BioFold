import { describe, expect, it } from "vitest";
import type { CommandExecution } from "../src/core/commandBus";
import {
  executionToProjectEvent,
  projectEventToActivity,
} from "../src/core/projectWorkspace";
import type { ProjectEventRecord } from "../src/types/projects";

describe("project workspace persistence mapping", () => {
  it("preserves assistant confirmation, provenance, input, and output", () => {
    const execution: CommandExecution = {
      command: "show_surface",
      input: { visible: true, opacity: 0.55 },
      context: {
        origin: "agent",
        agentKind: "assistant",
        approvedByUser: true,
        sourceMessageId: "assistant-message-1",
      },
      result: {
        ok: true,
        data: { visible: true, opacity: 0.55, changedView: true },
        evidence: "calculated",
        provenance: { source: "local-calculation", structureId: "4HHB" },
        activityId: "activity-1",
      },
      activity: {
        id: "activity-1",
        command: "show_surface",
        origin: "agent",
        agentKind: "assistant",
        approvedByUser: true,
        sourceMessageId: "assistant-message-1",
        status: "success",
        message: "Surface shown.",
        createdAt: "2026-09-01T12:00:00.000Z",
        durationMs: 42,
      },
    };

    expect(executionToProjectEvent(execution)).toEqual({
      activityId: "activity-1",
      command: "show_surface",
      origin: "agent",
      agentKind: "assistant",
      approvedByUser: true,
      sourceMessageId: "assistant-message-1",
      status: "success",
      evidence: "calculated",
      provenance: { source: "local-calculation", structureId: "4HHB" },
      input: { visible: true, opacity: 0.55 },
      output: { visible: true, opacity: 0.55, changedView: true },
      durationMs: 42,
      createdAt: "2026-09-01T12:00:00.000Z",
    });
  });

  it("uses the stored command error when restoring activity", () => {
    const event: ProjectEventRecord = {
      id: "event-1",
      projectId: "project-1",
      activityId: "activity-2",
      command: "measure_distance",
      origin: "human",
      status: "error",
      evidence: "unavailable",
      input: {
        from: { chain: "A", residueNumber: 1, atomName: "CA" },
        to: { chain: "A", residueNumber: 10, atomName: "CA" },
      },
      error: {
        code: "SELECTION_NOT_FOUND",
        message: "The selected atom was not found.",
        retryable: false,
      },
      durationMs: 3,
      createdAt: "2026-09-01T12:01:00.000Z",
    };

    expect(projectEventToActivity(event)).toEqual({
      id: "activity-2",
      command: "measure_distance",
      origin: "human",
      status: "error",
      message: "The selected atom was not found.",
      createdAt: "2026-09-01T12:01:00.000Z",
      durationMs: 3,
      agentKind: undefined,
      approvedByUser: undefined,
      sourceMessageId: undefined,
    });
  });

  it("restores the explanatory UniProt highlight message", () => {
    const expectedMessage =
      "UniProt annotations retrieved for 1CRN, but no annotated residues matched the loaded chains and residue numbers.";
    const event = {
      id: "event-annotation", projectId: "project-1", activityId: "activity-annotation",
      command: "query_uniprot_annotations", origin: "agent", agentKind: "webmcp",
      status: "success", evidence: "observed", input: { pdbId: "1CRN" },
      output: {
        annotations: { pdbId: "1CRN", proteinName: "Crambin", organism: "Crambe hispanica", activeSites: [], disulfideBonds: [], variants: [] },
        highlightedCount: 0, changedView: false, highlightStatus: "no_matching_residues",
        message: expectedMessage,
      },
      durationMs: 12, createdAt: "2026-09-04T18:00:00.000Z",
    } as ProjectEventRecord;
    expect(projectEventToActivity(event).message).toBe(expectedMessage);
  });
});
