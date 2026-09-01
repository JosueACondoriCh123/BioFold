import { describe, expect, it } from "vitest";
import { parseAssistantRequest, parseCommandProposal } from "../src/types/assistant";
import {
  createEmptyWorkspaceSnapshot,
  parseViewerCameraState,
  parseWorkspaceSnapshot,
} from "../src/types/projects";

describe("Phase 2 shared contracts", () => {
  it("normalizes an initial project snapshot without leaking transient viewer state", () => {
    expect(createEmptyWorkspaceSnapshot("4hhb")).toEqual({
      schemaVersion: 1,
      structure: { pdbId: "4HHB", source: "fixture" },
      view: { representation: "cartoon", colorScheme: "chain", camera: null },
      surface: { visible: false, opacity: 0.72 },
      selectedResidues: [],
    });
    expect(() => createEmptyWorkspaceSnapshot("invalid")).toThrow(/four-character PDB ID/i);
  });

  it("accepts only the eight-number camera contract used by 3Dmol", () => {
    const camera = [1, 2, 3, 4, 0, 0, 0, 1];
    expect(parseViewerCameraState(camera)).toEqual(camera);
    expect(() => parseViewerCameraState([1, 2])).toThrow(/eight finite numbers/i);
    expect(() => parseViewerCameraState([1, 2, 3, 4, 0, 0, Number.NaN, 1])).toThrow();
  });

  it("validates and clones snapshots read from persistence", () => {
    const source = createEmptyWorkspaceSnapshot("1CRN");
    source.view.camera = [1, 2, 3, 4, 0, 0, 0, 1];
    const parsed = parseWorkspaceSnapshot(source);
    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(() => parseWorkspaceSnapshot({ ...source, schemaVersion: 2 })).toThrow(/schema version 1/i);
    expect(() => parseWorkspaceSnapshot({
      ...source,
      surface: { visible: true, opacity: 4 },
    })).toThrow(/schema version 1/i);
  });

  it("keeps assistant requests narrow and bounded", () => {
    expect(parseAssistantRequest({
      requestId: "request-1",
      projectId: "project-1",
      message: "  Explain the selected residue.  ",
    })).toMatchObject({ message: "Explain the selected residue." });
    expect(() => parseAssistantRequest({
      requestId: "request-1",
      projectId: "project-1",
      message: "hello",
      model: "untrusted-model",
    })).toThrow(/unsupported properties/i);
  });

  it("validates proposed commands through the canonical WebMCP contracts", () => {
    expect(parseCommandProposal({
      id: "proposal-1",
      command: "set_representation",
      input: { style: "stick", colorScheme: "spectrum" },
      rationale: "Make residue progression visible.",
    })).toMatchObject({
      command: "set_representation",
      input: { style: "stick", colorScheme: "spectrum" },
    });
    expect(() => parseCommandProposal({
      id: "proposal-2",
      command: "set_representation",
      input: { style: "wireframe", colorScheme: "spectrum" },
      rationale: "Unsupported style.",
    })).toThrow(/supported style/i);
  });
});
