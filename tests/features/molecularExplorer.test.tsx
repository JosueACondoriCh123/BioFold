import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MolecularExplorer } from "../../src/features/explorer/MolecularExplorer";

afterEach(cleanup);

describe("Molecular Explorer Component (Phase 2.4)", () => {
  it("renders the explorer header and all 52 molecules by default", () => {
    const onSelect = vi.fn();
    render(<MolecularExplorer currentPdbId="1CRN" onSelectMolecule={onSelect} />);

    expect(screen.getByRole("region", { name: "Molecular Explorer" })).toBeInTheDocument();
    expect(screen.getByText(/Showing \d+ of \d+ molecules/)).toBeInTheDocument();

    // Check that 1CRN card is present and marked as Active
    const crnCard = screen.getByText("Crambin").closest("article");
    expect(crnCard).not.toBeNull();
    expect(crnCard).toHaveTextContent("Active");
  });

  it("filters molecules by biological category", () => {
    const onSelect = vi.fn();
    render(<MolecularExplorer currentPdbId="1CRN" onSelectMolecule={onSelect} />);

    // Click "Viral Targets" category pill
    const viralBtn = screen.getByRole("tab", { name: /Viral Targets/i });
    fireEvent.click(viralBtn);

    // Should display viral proteins like 6LU7, 6VXX, etc.
    expect(screen.getByText(/SARS-CoV-2 Main Protease/)).toBeInTheDocument();
    // Crambin (enzymes) should not be visible
    expect(screen.queryByText("Crambin")).not.toBeInTheDocument();
  });

  it("filters molecules by search query", () => {
    const onSelect = vi.fn();
    render(<MolecularExplorer currentPdbId="1CRN" onSelectMolecule={onSelect} />);

    const searchInput = screen.getByLabelText("Search molecules");
    fireEvent.change(searchInput, { target: { value: "Sotorasib" } });

    // Should find 6OIM (KRAS G12C + Sotorasib)
    expect(screen.getByText(/KRAS G12C \+ Sotorasib/)).toBeInTheDocument();
    expect(screen.getByText("6OIM")).toBeInTheDocument();
    expect(screen.queryByText("Crambin")).not.toBeInTheDocument();
  });

  it("triggers onSelectMolecule callback when clicking Inspect 3D or Workbench", () => {
    const onSelect = vi.fn();
    render(<MolecularExplorer currentPdbId="1CRN" onSelectMolecule={onSelect} />);

    // Find Inspect 3D button on 1TIM
    const timInspectBtn = screen.getByTitle("Load 1TIM into 3D Studio");
    fireEvent.click(timInspectBtn);

    expect(onSelect).toHaveBeenCalledWith("1TIM", "studio");

    // Find Workbench button on 1TIM
    const timWorkbenchBtn = screen.getByTitle("Analyze sequence & mutations of 1TIM");
    fireEvent.click(timWorkbenchBtn);

    expect(onSelect).toHaveBeenCalledWith("1TIM", "workbench");
  });
});
