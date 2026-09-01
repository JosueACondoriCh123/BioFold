import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import type {
  AssistantClient,
  AssistantRequest,
  AssistantStreamEvent,
  AssistantStreamOptions,
  CommandProposal,
} from "../../src/types/assistant";
import type {
  DistanceMeasurement,
  MutationPreview,
  StructureSummary,
} from "../../src/types/domain";
import { InspectorPanel } from "../../src/features/assistant/ui/InspectorPanel";
import { ResultsTab } from "../../src/features/assistant/ui/ResultsTab";
import { AssistantChat } from "../../src/features/assistant/ui/AssistantChat";
import { CommandProposalCard } from "../../src/features/assistant/ui/CommandProposalCard";
import { CitationsList } from "../../src/features/assistant/ui/CitationsList";

function createMockAssistantClient(eventsToEmit: AssistantStreamEvent[]): AssistantClient {
  return {
    async *stream(_request: AssistantRequest, options?: AssistantStreamOptions) {
      for (const event of eventsToEmit) {
        if (options?.signal?.aborted) {
          return;
        }
        yield event;
      }
    },
  };
}

describe("Assistant & Inspector UI Component Tests", () => {
  describe("InspectorPanel", () => {
    it("renders with Results tab by default and switches to Assistant tab", () => {
      const mockClient = createMockAssistantClient([]);
      render(<InspectorPanel assistantClient={mockClient} />);

      expect(screen.getByRole("tab", { name: /Results/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Assistant/i })).toHaveAttribute("aria-selected", "false");

      const assistantTab = screen.getByRole("tab", { name: /Assistant/i });
      fireEvent.click(assistantTab);

      expect(screen.getByRole("tab", { name: /Assistant/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Results/i })).toHaveAttribute("aria-selected", "false");
    });

    it("navigates tabs using keyboard arrow keys", () => {
      const mockClient = createMockAssistantClient([]);
      render(<InspectorPanel assistantClient={mockClient} />);

      const resultsTab = screen.getByRole("tab", { name: /Results/i });
      resultsTab.focus();

      fireEvent.keyDown(resultsTab, { key: "ArrowRight" });
      expect(screen.getByRole("tab", { name: /Assistant/i })).toHaveAttribute("aria-selected", "true");

      const assistantTab = screen.getByRole("tab", { name: /Assistant/i });
      fireEvent.keyDown(assistantTab, { key: "ArrowLeft" });
      expect(screen.getByRole("tab", { name: /Results/i })).toHaveAttribute("aria-selected", "true");
    });

    it("collapses and expands inspector panel", () => {
      const mockClient = createMockAssistantClient([]);
      render(<InspectorPanel assistantClient={mockClient} />);

      const toggleBtn = screen.getByRole("button", { name: "Collapse inspector panel" });
      fireEvent.click(toggleBtn);

      expect(screen.getByRole("button", { name: "Expand inspector panel" })).toBeInTheDocument();
      expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Expand inspector panel" }));
      expect(screen.getByRole("button", { name: "Collapse inspector panel" })).toBeInTheDocument();
    });
  });

  describe("ResultsTab", () => {
    it("renders empty results message when no data is provided", () => {
      render(<ResultsTab />);
      expect(screen.getByText("No analysis results yet")).toBeInTheDocument();
    });

    it("renders structure summary, distance measurement, and mutation context", () => {
      const summary: StructureSummary = {
        chains: ["A", "B"],
        chainCount: 2,
        residueCount: 140,
        atomCount: 1200,
        ligandCount: 1,
        waterCount: 45,
      };

      const measurement: DistanceMeasurement = {
        from: { chain: "A", residueNumber: 1, atomName: "CA" },
        to: { chain: "A", residueNumber: 10, atomName: "CA" },
        angstroms: 12.6,
      };

      const mutation: MutationPreview = {
        residue: { chain: "A", residueNumber: 10 },
        originalAminoAcid: "Valine",
        targetAminoAcid: "Tryptophan",
        neighbors: [{ chain: "A", residueNumber: 11, residueName: "LEU", distance: 3.8 }],
        heuristics: [
          { dimension: "size", from: "small", to: "bulky", changed: true, note: "Significantly larger sidechain volume" },
        ],
        disclaimer: "Mutation preview is a labeled heuristic, not a stability prediction.",
      };

      render(
        <ResultsTab
          summary={summary}
          measurement={measurement}
          mutation={mutation}
          activityEntries={[
            {
              id: "act-1",
              command: "measure_distance",
              origin: "agent",
              status: "success",
              message: "Distance: 12.60 Å",
              createdAt: "2026-09-01T00:00:00Z",
              durationMs: 5,
            },
          ]}
        />,
      );

      // Structure Summary
      expect(screen.getByText("Structure Composition")).toBeInTheDocument();
      expect(screen.getByText("140")).toBeInTheDocument();
      expect(screen.getByText("1200")).toBeInTheDocument();

      // Measurement
      expect(screen.getByText("12.60 Å")).toBeInTheDocument();
      expect(screen.getByText(/From:/i)).toBeInTheDocument();

      // Mutation Context
      expect(screen.getByText("Mutation Context")).toBeInTheDocument();
      expect(screen.getByText(/Valine → Tryptophan/i)).toBeInTheDocument();
      expect(screen.getByText(/1 spatial neighbor residues/i)).toBeInTheDocument();
      expect(screen.getByText(/Mutation preview is a labeled heuristic/i)).toBeInTheDocument();

      // Activity Stream
      expect(screen.getByText("Activity Audit Trail")).toBeInTheDocument();
      expect(screen.getByText("measure_distance")).toBeInTheDocument();
    });
  });

  describe("AssistantChat", () => {
    it("renders empty state with suggested prompts", () => {
      const mockClient = createMockAssistantClient([]);
      render(<AssistantChat assistantClient={mockClient} projectId="p1" />);

      expect(screen.getByText("Ask anything about the structure")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "“Summarize this structure and focus residue 10”" }),
      ).toBeInTheDocument();
    });

    it("sends message and renders streamed response with citations and proposals", async () => {
      const proposal: CommandProposal = {
        id: "prop-1",
        command: "focus_residues",
        input: { residues: [{ chain: "A", residueNumber: 10 }], label: true },
        rationale: "Residue 10 is central to the hydrophobic core.",
      };

      const mockClient = createMockAssistantClient([
        { type: "meta", requestId: "r1", conversationId: "c1", assistantMessageId: "a1" },
        { type: "delta", text: "Analyzing the hydrophobic core. " },
        { type: "delta", text: "Residue A:10 is key." },
        {
          type: "citations",
          citations: [
            {
              id: "cit-1",
              title: "Crambin Structure 1CRN",
              publisher: "RCSB PDB",
              url: "https://www.rcsb.org/structure/1CRN",
              retrievedAt: "2026-09-01",
            },
          ],
        },
        { type: "proposals", proposals: [proposal] },
        { type: "done", interrupted: false },
      ]);

      const handleApply = vi.fn();
      render(
        <AssistantChat
          assistantClient={mockClient}
          projectId="p1"
          onApplyProposal={handleApply}
        />,
      );

      const input = screen.getByLabelText("Assistant prompt message");
      fireEvent.change(input, { target: { value: "Tell me about residue 10" } });

      const sendBtn = screen.getByRole("button", { name: "Send message to assistant" });
      fireEvent.click(sendBtn);

      // Verify user message appears
      expect(screen.getByText("Tell me about residue 10")).toBeInTheDocument();

      // Verify streamed assistant text appears
      await waitFor(() => {
        expect(
          screen.getByText("Analyzing the hydrophobic core. Residue A:10 is key."),
        ).toBeInTheDocument();
      });

      // Verify Citations
      const citationsToggle = screen.getByRole("button", { name: /Scientific sources \(1\)/i });
      expect(citationsToggle).toBeInTheDocument();
      fireEvent.click(citationsToggle);
      expect(screen.getByText("Crambin Structure 1CRN")).toBeInTheDocument();

      // Verify Command Proposal Card
      expect(screen.getByText("Focus Residues")).toBeInTheDocument();
      expect(screen.getByText("Residue 10 is central to the hydrophobic core.")).toBeInTheDocument();

      const applyBtn = screen.getByRole("button", { name: "Apply proposed command Focus Residues" });
      fireEvent.click(applyBtn);

      expect(handleApply).toHaveBeenCalledTimes(1);
      expect(handleApply).toHaveBeenCalledWith(proposal);
      expect(screen.getByText("Applied to scene")).toBeInTheDocument();
    });

    it("handles dismissing a command proposal", async () => {
      const proposal: CommandProposal = {
        id: "prop-2",
        command: "show_surface",
        input: { visible: true, opacity: 0.6 },
        rationale: "Show surface for binding groove.",
      };

      const mockClient = createMockAssistantClient([
        { type: "meta", requestId: "r2", conversationId: "c2", assistantMessageId: "a2" },
        { type: "delta", text: "Here is a proposal." },
        { type: "proposals", proposals: [proposal] },
        { type: "done", interrupted: false },
      ]);

      render(<AssistantChat assistantClient={mockClient} projectId="p1" />);

      const input = screen.getByLabelText("Assistant prompt message");
      fireEvent.change(input, { target: { value: "Show surface" } });
      fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));

      await waitFor(() => {
        expect(screen.getByText("Show Surface")).toBeInTheDocument();
      });

      const dismissBtn = screen.getByRole("button", { name: "Dismiss proposal Show Surface" });
      fireEvent.click(dismissBtn);

      expect(screen.getByText("Proposal dismissed")).toBeInTheDocument();
    });
  });

  describe("CitationsList", () => {
    it("renders external citations with HTTPS links and badges", () => {
      const citations = [
        {
          id: "c1",
          title: "Evidence Guidelines",
          publisher: "BioFold" as const,
          url: "https://github.com/JosueACondoriCh123/BioFold",
          locator: "Section 2",
          retrievedAt: "2026-09-01",
        },
      ];

      render(<CitationsList citations={citations} />);

      const toggleBtn = screen.getByRole("button", { name: /Scientific sources \(1\)/i });
      fireEvent.click(toggleBtn);

      const link = screen.getByRole("link", { name: /Evidence Guidelines on BioFold/i });
      expect(link).toHaveAttribute("href", "https://github.com/JosueACondoriCh123/BioFold");
      expect(link).toHaveAttribute("target", "_blank");
      expect(screen.getByText("Section 2")).toBeInTheDocument();
    });
  });

  describe("CommandProposalCard", () => {
    it("renders proposal summary and triggers onDismiss", () => {
      const proposal: CommandProposal = {
        id: "p1",
        command: "measure_distance",
        input: {
          from: { chain: "A", residueNumber: 1, atomName: "CA" },
          to: { chain: "A", residueNumber: 10, atomName: "CA" },
        },
        rationale: "Measuring peptide backbone span.",
      };

      const onApply = vi.fn();
      const onDismiss = vi.fn();

      render(
        <CommandProposalCard
          proposal={proposal}
          onApply={onApply}
          onDismiss={onDismiss}
        />,
      );

      expect(screen.getByText("Measure Distance")).toBeInTheDocument();
      expect(screen.getByText("Measuring peptide backbone span.")).toBeInTheDocument();
      expect(screen.getByText("A:1:CA → A:10:CA")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Dismiss proposal Measure Distance" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
