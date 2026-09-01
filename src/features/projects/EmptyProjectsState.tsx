import { FolderPlus, Sparkles } from "lucide-react";

export interface EmptyProjectsStateProps {
  onCreate: () => void;
}

export function EmptyProjectsState({ onCreate }: EmptyProjectsStateProps) {
  return (
    <div className="bf-empty-projects" role="region" aria-label="No projects">
      <div className="bf-empty-icon-wrapper">
        <FolderPlus size={36} aria-hidden="true" />
      </div>
      <h3>No saved projects yet</h3>
      <p>
        Create a project to save your 3D molecular structures, custom views,
        distance measurements, and AI assistant notes across sessions.
      </p>
      <button
        type="button"
        className="bf-button bf-create-first-btn"
        onClick={onCreate}
        aria-label="Create your first project"
      >
        <Sparkles size={16} aria-hidden="true" /> Create your first project
      </button>
    </div>
  );
}
