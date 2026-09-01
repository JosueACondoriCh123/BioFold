import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, LoaderCircle, AlertCircle } from "lucide-react";

export interface ProjectDialogProps {
  isOpen: boolean;
  mode: "create" | "edit";
  initialData?: {
    title: string;
    description: string;
    activePdbId?: string | null;
  };
  isSaving?: boolean;
  error?: string | null;
  onSave: (data: { title: string; description: string; pdbId?: string }) => void;
  onClose: () => void;
}

export function ProjectDialog({
  isOpen,
  mode,
  initialData,
  isSaving = false,
  error = null,
  onSave,
  onClose,
}: ProjectDialogProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [pdbId, setPdbId] = useState(initialData?.activePdbId ?? "");
  const [clientError, setClientError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title ?? "");
      setDescription(initialData?.description ?? "");
      setPdbId(initialData?.activePdbId ?? "");
      setClientError(null);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen && !isSaving) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setClientError("Project title is required.");
      titleInputRef.current?.focus();
      return;
    }
    if (trimmedTitle.length > 120) {
      setClientError("Project title must be 120 characters or less.");
      return;
    }
    if (description.length > 1000) {
      setClientError("Description must be 1,000 characters or less.");
      return;
    }
    const normalizedPdb = pdbId.trim().toUpperCase();
    if (normalizedPdb && !/^[A-Z0-9]{4}$/.test(normalizedPdb)) {
      setClientError("PDB ID must contain exactly 4 alphanumeric characters.");
      return;
    }

    setClientError(null);
    onSave({
      title: trimmedTitle,
      description: description.trim(),
      pdbId: normalizedPdb || undefined,
    });
  }

  const displayedError = clientError || error;

  return (
    <div className="bf-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}>
      <div
        ref={dialogRef}
        className="bf-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
      >
        <header className="bf-modal-header">
          <h2 id="project-dialog-title">
            {mode === "create" ? "Create new project" : "Edit project details"}
          </h2>
          <button
            type="button"
            className="bf-modal-close-btn"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="bf-modal-form">
          {displayedError && (
            <div className="bf-modal-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{displayedError}</span>
            </div>
          )}

          <div className="bf-form-group">
            <label htmlFor="project-title-input">
              Project title <span className="bf-required">*</span>
            </label>
            <input
              id="project-title-input"
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Ribosome Subunit Analysis"
              maxLength={120}
              disabled={isSaving}
              required
            />
            <span className="bf-char-count">{title.length}/120</span>
          </div>

          <div className="bf-form-group">
            <label htmlFor="project-desc-input">Description (optional)</label>
            <textarea
              id="project-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add research notes or objective details…"
              rows={3}
              maxLength={1000}
              disabled={isSaving}
            />
            <span className="bf-char-count">{description.length}/1000</span>
          </div>

          {mode === "create" && (
            <div className="bf-form-group">
              <label htmlFor="project-pdb-input">Initial PDB ID (optional)</label>
              <input
                id="project-pdb-input"
                type="text"
                value={pdbId}
                onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                placeholder="e.g., 1CRN or 4HHB"
                maxLength={4}
                disabled={isSaving}
              />
              <span className="bf-form-hint">Leave blank to start with default Crambin.</span>
            </div>
          )}

          <footer className="bf-modal-footer">
            <button
              type="button"
              className="bf-button bf-button-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bf-button bf-modal-submit-btn"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <LoaderCircle size={16} className="bf-spin" aria-hidden="true" />
                  {mode === "create" ? "Creating…" : "Saving…"}
                </>
              ) : mode === "create" ? (
                "Create project"
              ) : (
                "Save changes"
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
