import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UniversalSearch } from "../../src/components/search/UniversalSearch";

describe("UniversalSearch Component", () => {
  it("renders search input with placeholder and submit button", () => {
    const handleSelect = vi.fn();
    render(<UniversalSearch onSelect={handleSelect} currentId="1CRN" />);

    const input = screen.getByPlaceholderText(/Search PDB ID, protein name/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("1CRN");

    const exploreButton = screen.getByRole("button", { name: /Explore/i });
    expect(exploreButton).toBeInTheDocument();
  });

  it("triggers selection when submitting the form", () => {
    const handleSelect = vi.fn();
    render(<UniversalSearch onSelect={handleSelect} currentId="" />);

    const input = screen.getByPlaceholderText(/Search PDB ID, protein name/i);
    fireEvent.change(input, { target: { value: "4hhb" } });

    const exploreButton = screen.getByRole("button", { name: /Explore/i });
    fireEvent.click(exploreButton);

    expect(handleSelect).toHaveBeenCalledWith("4HHB");
  });

  it("shows suggestions dropdown when typing a recognized keyword", async () => {
    const handleSelect = vi.fn();
    render(<UniversalSearch onSelect={handleSelect} currentId="" />);

    const input = screen.getByPlaceholderText(/Search PDB ID, protein name/i);
    fireEvent.change(input, { target: { value: "crambin" } });

    await waitFor(
      () => {
        expect(screen.getByText("Biological Matches")).toBeInTheDocument();
      },
      { timeout: 1500 },
    );

    const crambinOption = screen.getByText("1CRN");
    expect(crambinOption).toBeInTheDocument();

    fireEvent.click(crambinOption);
    expect(handleSelect).toHaveBeenCalledWith("1CRN");
  });

  it("clears search input when clicking clear button", () => {
    const handleSelect = vi.fn();
    render(<UniversalSearch onSelect={handleSelect} currentId="1CRN" />);

    const clearButton = screen.getByTitle(/Clear search/i);
    fireEvent.click(clearButton);

    const input = screen.getByPlaceholderText(/Search PDB ID, protein name/i);
    expect(input).toHaveValue("");
  });
});
