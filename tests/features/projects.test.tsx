import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import { InMemoryProjectDataPort } from "../../src/phase2/inMemoryProjectDataPort";
import { ProjectsDashboard } from "../../src/features/projects/ProjectsDashboard";
import { PersistenceIndicator } from "../../src/features/projects/PersistenceIndicator";
import { ProjectCard } from "../../src/features/projects/ProjectCard";
import type { ProjectSummary } from "../../src/types/projects";

describe("Projects Feature Component Tests", () => {
  it("renders empty state when there are no saved projects", async () => {
    const dataPort = new InMemoryProjectDataPort();
    const handleOpen = vi.fn();

    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={handleOpen} />);

    expect(screen.getByText("Loading your projects…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("No saved projects yet")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Create your first project" })).toBeInTheDocument();
  });

  it("lists existing projects and allows opening a project in laboratory", async () => {
    const dataPort = new InMemoryProjectDataPort();
    await dataPort.createProject({
      title: "Hemoglobin Analysis",
      description: "Studying quaternary structure",
    });

    const handleOpen = vi.fn();
    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText("Hemoglobin Analysis")).toBeInTheDocument();
    });

    expect(screen.getByText("Studying quaternary structure")).toBeInTheDocument();
    expect(screen.getByText("Rev 1")).toBeInTheDocument();

    const openBtn = screen.getByRole("button", { name: "Open project Hemoglobin Analysis in laboratory" });
    fireEvent.click(openBtn);
    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hemoglobin Analysis" }),
    );
  });

  it("creates a new project through the project dialog", async () => {
    const dataPort = new InMemoryProjectDataPort();
    const handleOpen = vi.fn();

    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={handleOpen} />);

    await waitFor(() => {
      expect(screen.getByText("No saved projects yet")).toBeInTheDocument();
    });

    const newBtn = screen.getByRole("button", { name: "Create new project" });
    fireEvent.click(newBtn);

    expect(screen.getByRole("dialog", { name: "Create new project" })).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Project title/i);
    const descInput = screen.getByLabelText(/Description/i);
    const pdbInput = screen.getByLabelText(/Initial PDB ID/i);

    fireEvent.change(titleInput, { target: { value: "Crambin Disulfide Bonds" } });
    fireEvent.change(descInput, { target: { value: "Mapping CYS-CYS bridges" } });
    fireEvent.change(pdbInput, { target: { value: "4HHB" } });

    const submitBtn = screen.getByRole("button", { name: "Create project" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Crambin Disulfide Bonds")).toBeInTheDocument();
    expect(screen.getByText("4HHB")).toBeInTheDocument();
    expect(screen.getByText(/Project “Crambin Disulfide Bonds” created/i)).toBeInTheDocument();
  });

  it("creates a new project by uploading a PDB structure file", async () => {
    const dataPort = new InMemoryProjectDataPort();
    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={vi.fn()} />);

    const newBtn = screen.getByRole("button", { name: /New project/i });
    fireEvent.click(newBtn);

    const uploadTab = screen.getByRole("tab", { name: /Upload File/i });
    fireEvent.click(uploadTab);

    const titleInput = screen.getByLabelText(/Project title/i);
    fireEvent.change(titleInput, { target: { value: "My Synthetic Protein" } });

    const pdbContent = "HEADER    CUSTOM PROTEIN\nATOM      1  N   MET A   1      11.104  13.201  -9.041  1.00 10.00           N\n";
    const file = new File([pdbContent], "custom_synth.pdb", { type: "text/plain" });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    await waitFor(() => {
      expect(screen.getByText("custom_synth.pdb")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: "Create project" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("My Synthetic Protein")).toBeInTheDocument();
  });

  it("edits an existing project title and description", async () => {
    const dataPort = new InMemoryProjectDataPort();
    const createRes = await dataPort.createProject({
      title: "Initial Name",
      description: "Initial Desc",
    });
    if (!createRes.ok) throw new Error("Setup failed");

    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Initial Name")).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: "Edit project Initial Name" });
    fireEvent.click(editBtn);

    expect(screen.getByRole("dialog", { name: "Edit project details" })).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Project title/i);
    fireEvent.change(titleInput, { target: { value: "Renamed Project" } });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Renamed Project")).toBeInTheDocument();
  });

  it("deletes a project with confirmation dialog", async () => {
    const dataPort = new InMemoryProjectDataPort();
    await dataPort.createProject({
      title: "Project to Delete",
      description: "Temporary data",
    });

    render(<ProjectsDashboard dataPort={dataPort} onOpenProject={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Project to Delete")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: "Delete project Project to Delete" });
    fireEvent.click(deleteBtn);

    expect(screen.getByRole("alertdialog", { name: "Delete project" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirm deletion of Project to Delete" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Project to Delete")).not.toBeInTheDocument();
    expect(screen.getByText(/Project “Project to Delete” deleted/i)).toBeInTheDocument();
  });

  describe("PersistenceIndicator", () => {
    it("renders saving state with accessible role", () => {
      render(<PersistenceIndicator status="saving" />);
      const indicator = screen.getByRole("status");
      expect(indicator).toHaveTextContent("Saving…");
    });

    it("renders saved state with revision badge", () => {
      render(<PersistenceIndicator status="saved" revision={3} />);
      const indicator = screen.getByRole("status");
      expect(indicator).toHaveTextContent("Saved · Rev 3");
    });

    it("renders offline mode indicator", () => {
      render(<PersistenceIndicator status="offline" />);
      const indicator = screen.getByRole("status");
      expect(indicator).toHaveTextContent("Offline mode");
    });

    it("renders conflict state with resolve action button", () => {
      const handleResolve = vi.fn();
      render(<PersistenceIndicator status="conflict" onResolveConflict={handleResolve} />);
      const indicator = screen.getByRole("status");
      expect(indicator).toHaveTextContent("Version conflict");

      const resolveBtn = screen.getByRole("button", { name: "Resolve project version conflict" });
      fireEvent.click(resolveBtn);
      expect(handleResolve).toHaveBeenCalledTimes(1);
    });

    it("renders error state with retry action button", () => {
      const handleRetry = vi.fn();
      render(<PersistenceIndicator status="error" onRetry={handleRetry} />);
      const retryBtn = screen.getByRole("button", { name: "Retry project synchronization" });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("ProjectCard", () => {
    it("renders card with active PDB ID badge and triggers callbacks", () => {
      const project: ProjectSummary = {
        id: "p1",
        title: "Structure Alpha",
        description: "Alpha details",
        activePdbId: "4HHB",
        revision: 2,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T01:00:00Z",
      };

      const onOpen = vi.fn();
      const onEdit = vi.fn();
      const onDelete = vi.fn();

      render(
        <ProjectCard
          project={project}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );

      expect(screen.getByText("Structure Alpha")).toBeInTheDocument();
      expect(screen.getByText("4HHB")).toBeInTheDocument();
      expect(screen.getByText("Rev 2")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Edit project Structure Alpha" }));
      expect(onEdit).toHaveBeenCalledWith(project);

      fireEvent.click(screen.getByRole("button", { name: "Delete project Structure Alpha" }));
      expect(onDelete).toHaveBeenCalledWith(project);

      fireEvent.click(screen.getByRole("button", { name: "Open project Structure Alpha in laboratory" }));
      expect(onOpen).toHaveBeenCalledWith(project);
    });
  });
});
