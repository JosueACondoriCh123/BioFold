import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MutationWorkbench } from "../../src/features/workbench/MutationWorkbench";
import { AuditHistoryView } from "../../src/features/audit/AuditHistoryView";
import type { ActivityEntry, MutationPreview, StructureSummary } from "../../src/types/domain";

afterEach(cleanup);

describe("MutationWorkbench Component (Phase 2.4)", () => {
  const summary: StructureSummary = {
    chainCount: 1,
    residueCount: 46,
    atomCount: 327,
    chains: ["A"],
    ligandCount: 0,
    waterCount: 0,
  };

  it("renders target PDB ID, residue sequence, and in silico mutation form", () => {
    render(<MutationWorkbench currentPdbId="1CRN" summary={summary} />);

    expect(screen.getByRole("region", { name: "Sequence & Mutation Workbench" })).toBeInTheDocument();
    expect(screen.getByText(/Crambin/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute mutation impact" })).toBeInTheDocument();
  });

  it("triggers onExecuteMutation when computing variant impact", async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    render(
      <MutationWorkbench
        currentPdbId="1CRN"
        summary={summary}
        onExecuteMutation={onExecute}
      />,
    );

    // Select target amino acid ALA -> CYS
    const select = screen.getByLabelText("Target amino acid");
    fireEvent.change(select, { target: { value: "CYS" } });

    // Click compute button
    const computeBtn = screen.getByRole("button", { name: "Compute mutation impact" });
    fireEvent.click(computeBtn);

    expect(onExecute).toHaveBeenCalledWith("A", expect.any(Number), "CYS");
  });

  it("displays variant heuristics and neighboring residues", () => {
    const mutation: MutationPreview = {
      residue: { chain: "A", residueNumber: 10 },
      originalAminoAcid: "ALA",
      targetAminoAcid: "TRP",
      neighbors: [
        { chain: "A", residueNumber: 9, residueName: "CYS", distance: 1.45 },
        { chain: "A", residueNumber: 11, residueName: "ARG", distance: 3.2 },
        { chain: "A", residueNumber: 24, residueName: "THR", distance: 4.8 },
      ],
      heuristics: [
        { dimension: "size", from: "small", to: "bulky", changed: true, note: "Larger sidechain" },
      ],
      disclaimer: "Visual context and physicochemical heuristic only.",
    };

    render(
      <MutationWorkbench
        currentPdbId="1CRN"
        summary={summary}
        mutation={mutation}
      />,
    );

    expect(screen.getByText(/Variant: ALA10TRP/)).toBeInTheDocument();
    expect(screen.getByText(/A:24/)).toBeInTheDocument();
    expect(screen.getByText(/Visual context and physicochemical heuristic/)).toBeInTheDocument();
  });
});

describe("AuditHistoryView Component (Phase 2.4)", () => {
  const mockActivities: ActivityEntry[] = [
    {
      id: "act-1",
      command: "load_structure",
      origin: "human",
      status: "success",
      message: "Loaded structure 1CRN from fixture",
      createdAt: "2026-09-01T12:00:00Z",
      durationMs: 42,
    },
    {
      id: "act-2",
      command: "set_representation",
      origin: "agent",
      agentKind: "assistant",
      approvedByUser: true,
      status: "success",
      message: "Representation changed to cartoon",
      createdAt: "2026-09-01T12:01:00Z",
      durationMs: 15,
    },
    {
      id: "act-3",
      command: "measure_distance",
      origin: "human",
      status: "error",
      message: "Atom not found",
      createdAt: "2026-09-01T12:02:00Z",
      durationMs: 8,
    },
  ];

  it("renders metrics accurately and lists all events", () => {
    render(<AuditHistoryView activities={mockActivities} currentPdbId="1CRN" />);

    expect(screen.getByRole("region", { name: "Session Audit and Project Activity" })).toBeInTheDocument();
    expect(screen.getByText("Total Actions").closest("div")).toHaveTextContent("3");
    expect(screen.getByText("Confirmed Success").closest("div")).toHaveTextContent("2");
    expect(screen.getByText("Failed Actions").closest("div")).toHaveTextContent("1");

    expect(screen.getByText("load_structure")).toBeInTheDocument();
    expect(screen.getByText("set_representation")).toBeInTheDocument();
    expect(screen.getByText("measure_distance")).toBeInTheDocument();
  });

  it("filters table by origin and status", () => {
    render(<AuditHistoryView activities={mockActivities} currentPdbId="1CRN" />);

    // Filter by status: error
    const statusSelect = screen.getByLabelText("Status:");
    fireEvent.change(statusSelect, { target: { value: "error" } });

    expect(screen.getByText("measure_distance")).toBeInTheDocument();
    expect(screen.queryByText("load_structure")).not.toBeInTheDocument();
  });
});
