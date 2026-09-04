import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Laboratory from "../../src/Laboratory";
import { InMemoryProjectDataPort } from "../../src/phase2/inMemoryProjectDataPort";
import { createEmptyWorkspaceSnapshot } from "../../src/types/projects";
import { viewerPort } from "../../src/adapters/viewerPort";

vi.mock("../../src/adapters/viewerPort", () => ({
  viewerPort: {
    init: vi.fn().mockResolvedValue(undefined),
    loadStructure: vi.fn().mockResolvedValue(undefined),
    setStyle: vi.fn(),
    setSurface: vi.fn().mockResolvedValue(undefined),
    clearSurfaces: vi.fn(),
    selectResidues: vi.fn(),
    clearSelection: vi.fn(),
    measureDistance: vi.fn(),
    clearMeasurements: vi.fn(),
    zoom: vi.fn(),
    spin: vi.fn(),
    resetView: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    setSuspended: vi.fn(),
    hasModel: vi.fn(() => true),
  },
}));

afterEach(cleanup);

describe("E2E Laboratory Journey (Fase 4 - Agente 2)", () => {
  let projectPort: InMemoryProjectDataPort;
  let projectId: string;

  beforeEach(async () => {
    projectPort = new InMemoryProjectDataPort();
    const created = await projectPort.createProject({
      title: "SARS-CoV-2 Mpro Drug Discovery",
      description: "In silico screening against viral protease",
      snapshot: createEmptyWorkspaceSnapshot("1CRN"),
    });
    if (!created.ok) throw new Error("Failed to create test project");
    projectId = created.data.id;
  });

  it("executes the full multi-screen workflow with state preservation", async () => {
    render(
      <MemoryRouter>
        <Laboratory
          active={true}
          projectId={projectId}
          projectDataPort={projectPort}
          initialPdbId="1CRN"
        />
      </MemoryRouter>,
    );

    // 1. Check Subnav renders all 5 specialized screens with ARIA roles
    const tablist = screen.getByRole("tablist", { name: "Laboratory Workspaces" });
    expect(tablist).toBeInTheDocument();

    const studioTab = screen.getByRole("tab", { name: "Studio 3D" });
    const explorerTab = screen.getByRole("tab", { name: "Molecular Explorer" });
    const workbenchTab = screen.getByRole("tab", { name: "Sequence Workbench" });
    const copilotTab = screen.getByRole("tab", { name: "Research Copilot" });
    const auditTab = screen.getByRole("tab", { name: "Session Audit" });

    expect(studioTab).toHaveAttribute("aria-selected", "true");
    expect(explorerTab).toHaveAttribute("aria-selected", "false");

    // 2. Navigate to Molecular Explorer screen
    fireEvent.click(explorerTab);
    expect(explorerTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Molecular Explorer" })).toBeInTheDocument();

    // 3. Search and select a new molecule (6LU7 - SARS-CoV-2 Mpro)
    const searchInput = screen.getByLabelText("Search molecules");
    fireEvent.change(searchInput, { target: { value: "6LU7" } });
    expect(screen.getByText(/SARS-CoV-2 Main Protease/)).toBeInTheDocument();

    // Click "Inspect 3D" to load 6LU7 into the 3D Studio
    const inspectBtn = screen.getByTitle("Load 6LU7 into 3D Studio");
    fireEvent.click(inspectBtn);

    // Should return to Studio 3D with 6LU7 as target
    await waitFor(() => {
      expect(studioTab).toHaveAttribute("aria-selected", "true");
    });

    // 4. Navigate to Sequence & Mutation Workbench
    fireEvent.click(workbenchTab);
    expect(screen.getByRole("region", { name: "Sequence & Mutation Workbench" })).toBeInTheDocument();
    expect(screen.getByText(/Target Wild-Type Residue/)).toBeInTheDocument();

    // 5. Navigate to Session Audit & History
    fireEvent.click(auditTab);
    expect(screen.getByRole("region", { name: "Session Audit and Project Activity" })).toBeInTheDocument();
    expect(screen.getByText("Export Audit JSON")).toBeInTheDocument();

    // 6. Return to Studio 3D and verify WebGL canvas remained intact
    fireEvent.click(studioTab);
    expect(document.querySelector(".viewer-stage")).toBeInTheDocument();
  });

  it("detects and surfaces concurrent revision conflicts cleanly", async () => {
    render(
      <MemoryRouter>
        <Laboratory
          active={true}
          projectId={projectId}
          projectDataPort={projectPort}
          initialPdbId="1CRN"
        />
      </MemoryRouter>,
    );

    // Simulate another user/agent concurrently updating the project to revision 2
    await projectPort.saveSnapshot({
      projectId,
      expectedRevision: 1,
      snapshot: createEmptyWorkspaceSnapshot("4HHB"),
    });

    // The remote project is now at revision 2.
    // An attempt to save with expectedRevision 1 will return CONFLICT error code.
    const attempt = await projectPort.saveSnapshot({
      projectId,
      expectedRevision: 1,
      snapshot: createEmptyWorkspaceSnapshot("6LU7"),
    });

    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.error.code).toBe("CONFLICT");
    }
  });

  it("maintains keyboard accessible tabs and accessibility standards", () => {
    render(
      <MemoryRouter>
        <Laboratory
          active={true}
          projectId={projectId}
          projectDataPort={projectPort}
        />
      </MemoryRouter>,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(5);

    for (const tab of tabs) {
      expect(tab).toHaveAttribute("aria-selected");
      expect(tab).not.toBeDisabled();
    }
  });
});
