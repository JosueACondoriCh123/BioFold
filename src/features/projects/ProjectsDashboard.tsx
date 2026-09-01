import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, FolderKanban, LoaderCircle, AlertCircle, RefreshCw } from "lucide-react";
import type {
  CreateProjectInput,
  ProjectDataPort,
  ProjectRecord,
  ProjectSummary,
  UpdateProjectInput,
} from "../../types/projects";
import { createEmptyWorkspaceSnapshot } from "../../types/projects";
import { ProjectCard } from "./ProjectCard";
import { EmptyProjectsState } from "./EmptyProjectsState";
import { ProjectDialog } from "./ProjectDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { PersistenceIndicator } from "./PersistenceIndicator";
import type { PersistenceState } from "./types";
import "./projects.css";

export interface ProjectsDashboardProps {
  dataPort: ProjectDataPort;
  onOpenProject: (project: ProjectSummary | ProjectRecord) => void;
}

export function ProjectsDashboard({
  dataPort,
  onOpenProject,
}: ProjectsDashboardProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceState>("idle");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const notificationTimerRef = useRef<number | null>(null);

  const loadProjects = useCallback(async (showLoadingState = true) => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    if (showLoadingState) setIsLoading(true);
    setError(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPersistenceStatus("offline");
      if (showLoadingState) setIsLoading(false);
      return;
    }

    const result = await dataPort.listProjects({ signal: controller.signal });
    if (controller.signal.aborted) return;
    if (result.ok) {
      setProjects(result.data);
      setPersistenceStatus("saved");
    } else {
      setError(result.error.message);
      setPersistenceStatus("error");
    }
    if (showLoadingState) setIsLoading(false);
  }, [dataPort]);

  useEffect(() => {
    void loadProjects(true);
    return () => loadControllerRef.current?.abort();
  }, [loadProjects]);

  useEffect(() => {
    const handleOffline = () => setPersistenceStatus("offline");
    const handleOnline = () => { void loadProjects(false); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      mutationControllerRef.current?.abort();
      if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    };
  }, [loadProjects]);

  // Flash notification helper
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = window.setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  // Create Project handler
  async function handleCreateProject(data: { title: string; description: string; pdbId?: string }) {
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setIsSaving(true);
    setDialogError(null);
    setPersistenceStatus("saving");

    const input: CreateProjectInput = {
      title: data.title,
      description: data.description,
      snapshot: createEmptyWorkspaceSnapshot(data.pdbId ?? "1CRN"),
    };

    const result = await dataPort.createProject(input, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setIsSaving(false);

    if (result.ok) {
      setIsCreateOpen(false);
      setPersistenceStatus("saved");
      showNotification("success", `Project “${result.data.title}” created.`);
      await loadProjects(false);
    } else {
      setDialogError(result.error.message);
      setPersistenceStatus("error");
    }
  }

  // Edit / Rename Project handler
  async function handleUpdateProject(data: { title: string; description: string }) {
    if (!editingProject) return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setIsSaving(true);
    setDialogError(null);
    setPersistenceStatus("saving");

    const input: UpdateProjectInput = {
      projectId: editingProject.id,
      expectedRevision: editingProject.revision,
      title: data.title,
      description: data.description,
    };

    const result = await dataPort.updateProject(input, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setIsSaving(false);

    if (result.ok) {
      setEditingProject(null);
      setPersistenceStatus("saved");
      showNotification("success", `Project “${result.data.title}” updated.`);
      await loadProjects(false);
    } else {
      if (result.error.code === "CONFLICT") {
        setPersistenceStatus("conflict");
        setDialogError("Version conflict: this project was updated elsewhere. Please reload.");
      } else {
        setDialogError(result.error.message);
        setPersistenceStatus("error");
      }
    }
  }

  // Delete Project handler
  async function handleDeleteConfirm() {
    if (!deletingProject) return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setIsSaving(true);
    setDeleteError(null);
    setPersistenceStatus("saving");

    const result = await dataPort.deleteProject(deletingProject.id, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setIsSaving(false);

    if (result.ok) {
      const deletedTitle = deletingProject.title;
      setDeletingProject(null);
      setPersistenceStatus("saved");
      showNotification("success", `Project “${deletedTitle}” deleted.`);
      await loadProjects(false);
    } else {
      setPersistenceStatus("error");
      setDeleteError(result.error.message);
    }
  }

  return (
    <section className="bf-projects-dashboard" aria-labelledby="projects-dashboard-title">
      <header className="bf-projects-header">
        <div className="bf-projects-heading-group">
          <div className="bf-projects-title-row">
            <span className="bf-projects-icon" aria-hidden="true">
              <FolderKanban size={22} />
            </span>
            <h2 id="projects-dashboard-title">Saved Projects</h2>
            <span className="bf-projects-count" aria-label={`${projects.length} saved projects`}>
              {projects.length}
            </span>
          </div>
          <p className="bf-projects-subtitle">
            Private molecular workspaces persisted to your account.
          </p>
        </div>

        <div className="bf-projects-header-actions">
          <PersistenceIndicator
            status={persistenceStatus}
            onResolveConflict={() => loadProjects(false)}
            onRetry={() => loadProjects(false)}
          />
          <button
            type="button"
            className="bf-button bf-create-project-btn"
            onClick={() => setIsCreateOpen(true)}
            aria-label="Create new project"
          >
            <Plus size={16} aria-hidden="true" /> New project
          </button>
        </div>
      </header>

      {notification && (
        <div
          className={`bf-project-notification is-${notification.type}`}
          role={notification.type === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {notification.type === "error" ? (
            <AlertCircle size={16} aria-hidden="true" />
          ) : null}
          <span>{notification.message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="bf-projects-loading" role="status" aria-label="Loading projects">
          <LoaderCircle size={28} className="bf-spin" aria-hidden="true" />
          <span>Loading your projects…</span>
        </div>
      ) : error ? (
        <div className="bf-projects-error" role="alert">
          <AlertCircle size={24} aria-hidden="true" />
          <div>
            <h3>Could not load projects</h3>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="bf-button bf-button-ghost"
            onClick={() => loadProjects(true)}
          >
            <RefreshCw size={15} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyProjectsState onCreate={() => setIsCreateOpen(true)} />
      ) : (
        <div className="bf-projects-grid" role="list" aria-label="Projects list">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={onOpenProject}
              onEdit={(p) => setEditingProject(p)}
              onDelete={(p) => { setDeleteError(null); setDeletingProject(p); }}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <ProjectDialog
        isOpen={isCreateOpen}
        mode="create"
        isSaving={isSaving}
        error={dialogError}
        onSave={handleCreateProject}
        onClose={() => {
          setIsCreateOpen(false);
          setDialogError(null);
        }}
      />

      {/* Edit Dialog */}
      <ProjectDialog
        isOpen={Boolean(editingProject)}
        mode="edit"
        initialData={
          editingProject
            ? {
                title: editingProject.title,
                description: editingProject.description,
                activePdbId: editingProject.activePdbId,
              }
            : undefined
        }
        isSaving={isSaving}
        error={dialogError}
        onSave={handleUpdateProject}
        onClose={() => {
          setEditingProject(null);
          setDialogError(null);
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        isOpen={Boolean(deletingProject)}
        projectTitle={deletingProject?.title ?? ""}
        isDeleting={isSaving}
        error={deleteError}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeletingProject(null); setDeleteError(null); }}
      />
    </section>
  );
}
