import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StructureBookmarksSection } from "../../src/features/bookmarks/StructureBookmarksSection";

describe("StructureBookmarksSection Component", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && localStorage?.clear) {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it("renders empty state and allows pinning a new note", async () => {
    const handleFly = vi.fn();
    render(
      <StructureBookmarksSection
        pdbId="6LU7"
        selectedResidue={{ chain: "A", residueNumber: 145 }}
        onFlyToResidue={handleFly}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("3D Notes & Bookmarks")).toBeInTheDocument();
    });

    expect(screen.getByText(/No 3D bookmarks saved yet/i)).toBeInTheDocument();

    // Click "Pin Note"
    const pinBtn = screen.getByRole("button", { name: /Pin Note/i });
    fireEvent.click(pinBtn);

    // Form should appear with pre-filled target A:145
    expect(screen.getByPlaceholderText(/Write a scientific finding/i)).toBeInTheDocument();

    const noteInput = screen.getByPlaceholderText(/Write a scientific finding/i);
    fireEvent.change(noteInput, { target: { value: "Essential catalytic nucleophile" } });

    // Click "Save Bookmark"
    const saveBtn = screen.getByRole("button", { name: /Save Bookmark/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Essential catalytic nucleophile")).toBeInTheDocument();
    });

    expect(screen.getByText("A:145")).toBeInTheDocument();

    // Click "Fly 3D"
    const flyBtn = screen.getByRole("button", { name: /Fly 3D/i });
    fireEvent.click(flyBtn);

    expect(handleFly).toHaveBeenCalledWith("A", 145, expect.any(String));
  });
});
