import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import SharedProjectPage from "../../src/pages/SharedProjectPage";
import { saveLocalShare } from "../../src/services/sharingService";
import type { SharedProjectData } from "../../src/services/sharingService";

describe("SharedProjectPage Component", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && localStorage?.clear) {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it("renders error state when share token is not found", async () => {
    render(
      <MemoryRouter initialEntries={["/share/non_existent_token"]}>
        <Routes>
          <Route path="/share/:shareToken" element={<SharedProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Shared project not found or public sharing has been revoked."),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /Return to BioFold/i })).toBeInTheDocument();
  });

  it("renders public shared project workspace with read-only badge and project details", async () => {
    const mockData: SharedProjectData = {
      project: {
        id: "proj-shared-1",
        title: "Hemoglobin Alpha Subunit",
        description: "Public view of oxygen binding pocket",
        activePdbId: "4HHB",
        revision: 2,
        isPublic: true,
        shareToken: "sh_valid_token_4hhb",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: "owner-1",
        snapshot: {
          schemaVersion: 1,
          structure: { pdbId: "4HHB", source: "rcsb" },
          view: { representation: "cartoon", colorScheme: "chain", camera: null },
          surface: { visible: false, opacity: 0.8 },
          selectedResidues: [],
        },
      },
      annotations: [
        {
          id: "bm-1",
          pdbId: "4HHB",
          chain: "A",
          residueNumber: 87,
          note: "Proximal histidine coordinating heme",
          color: "#5ccfb5",
          createdAt: new Date().toISOString(),
        },
      ],
      events: [],
    };

    saveLocalShare("sh_valid_token_4hhb", mockData);

    render(
      <MemoryRouter initialEntries={["/share/sh_valid_token_4hhb"]}>
        <Routes>
          <Route path="/share/:shareToken" element={<SharedProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Hemoglobin Alpha Subunit")).toBeInTheDocument();
    });

    expect(screen.getByText("Public view of oxygen binding pocket")).toBeInTheDocument();
    expect(screen.getByText(/Read-Only View/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in BioFold/i })).toBeInTheDocument();

  });
});
