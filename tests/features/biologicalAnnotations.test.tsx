import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BiologicalAnnotationsSection } from "../../src/features/annotations/BiologicalAnnotationsSection";

describe("BiologicalAnnotationsSection Component", () => {
  it("renders catalytic sites and triggers 3D highlight on click for 6LU7", async () => {
    const handleHighlight = vi.fn();
    const handleInspect = vi.fn();

    render(
      <BiologicalAnnotationsSection
        pdbId="6LU7"
        onHighlightResidues={handleHighlight}
        onInspectMutation={handleInspect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Biological Annotations")).toBeInTheDocument();
    });

    expect(screen.getByText(/3C-like proteinase/i)).toBeInTheDocument();
    expect(screen.getByText("Catalytic & Active Sites")).toBeInTheDocument();

    // Look for His41 or Cys145
    const his41Text = screen.getByText(/His A:41/i);
    expect(his41Text).toBeInTheDocument();

    // Click on "Focus 3D" for His41
    const focusButtons = screen.getAllByRole("button", { name: /Focus 3D/i });
    expect(focusButtons.length).toBeGreaterThan(0);
    fireEvent.click(focusButtons[0]);

    expect(handleHighlight).toHaveBeenCalledWith([{ chain: "A", residueNumber: 41 }]);
  });

  it("triggers highlight for all catalytic sites when clicking highlight all button", async () => {
    const handleHighlight = vi.fn();

    render(
      <BiologicalAnnotationsSection
        pdbId="6LU7"
        onHighlightResidues={handleHighlight}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Highlight All Catalytic Sites")).toBeInTheDocument();
    });

    const highlightAllBtn = screen.getByText("Highlight All Catalytic Sites");
    fireEvent.click(highlightAllBtn);

    expect(handleHighlight).toHaveBeenCalled();
    const callArg = handleHighlight.mock.calls[0][0];
    expect(callArg.length).toBeGreaterThanOrEqual(2);
  });

  it("renders disulfide bridges for Crambin (1CRN)", async () => {
    const handleHighlight = vi.fn();

    render(
      <BiologicalAnnotationsSection
        pdbId="1CRN"
        onHighlightResidues={handleHighlight}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Disulfide Bridges")).toBeInTheDocument();
    });

    // Expand Disulfide accordion
    const disulfideAccordionBtn = screen.getByRole("button", { name: /Disulfide Bridges/i });
    fireEvent.click(disulfideAccordionBtn);

    await waitFor(() => {
      expect(screen.getByText(/Cys3 – Cys40/i)).toBeInTheDocument();
    });

    const focusBondButtons = screen.getAllByRole("button", { name: /Focus Bond/i });
    expect(focusBondButtons.length).toBeGreaterThan(0);
    fireEvent.click(focusBondButtons[0]);

    expect(handleHighlight).toHaveBeenCalledWith([
      { chain: "A", residueNumber: 3 },
      { chain: "A", residueNumber: 40 },
    ]);
  });
});
