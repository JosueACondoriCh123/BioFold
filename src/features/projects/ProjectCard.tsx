import { ArrowUpRight, Edit3, Trash2, Atom, Clock } from "lucide-react";
import type { ProjectSummary } from "../../types/projects";

export interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (project: ProjectSummary) => void;
  onEdit: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}

export function ProjectCard({
  project,
  onOpen,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const formattedDate = new Date(project.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article
      className="bf-project-card"
      aria-labelledby={`project-title-${project.id}`}
      data-project-id={project.id}
    >
      <div className="bf-project-card-header">
        <div className="bf-project-badges">
          {project.activePdbId ? (
            <span className="bf-pdb-badge" aria-label={`PDB Structure: ${project.activePdbId}`}>
              <Atom size={13} aria-hidden="true" /> {project.activePdbId}
            </span>
          ) : (
            <span className="bf-pdb-badge is-empty" aria-label="No structure loaded">
              No structure
            </span>
          )}
          <span className="bf-revision-badge" aria-label={`Revision ${project.revision}`}>
            Rev {project.revision}
          </span>
        </div>

        <div className="bf-project-card-actions">
          <button
            type="button"
            className="bf-card-action-btn"
            onClick={() => onEdit(project)}
            aria-label={`Edit project ${project.title}`}
            title="Edit project"
          >
            <Edit3 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="bf-card-action-btn is-danger"
            onClick={() => onDelete(project)}
            aria-label={`Delete project ${project.title}`}
            title="Delete project"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="bf-project-card-body">
        <h3 id={`project-title-${project.id}`} className="bf-project-title">
          {project.title}
        </h3>
        <p className="bf-project-description">
          {project.description || "No description provided."}
        </p>
      </div>

      <div className="bf-project-card-footer">
        <span className="bf-project-timestamp">
          <Clock size={12} aria-hidden="true" /> Updated {formattedDate}
        </span>
        <button
          type="button"
          className="bf-open-project-btn"
          onClick={() => onOpen(project)}
          aria-label={`Open project ${project.title} in laboratory`}
        >
          Open in lab <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
