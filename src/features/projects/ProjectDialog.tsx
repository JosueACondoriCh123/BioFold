import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, LoaderCircle, AlertCircle, Upload, FileText } from "lucide-react";
import { detectStructureFormat } from "../../adapters/structureGateway";

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
  onSave: (data: {
    title: string;
    description: string;
    pdbId?: string;
    fileData?: {
      name: string;
      content: string;
      format: "cif" | "pdb";
    };
  }) => void;
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
  const [sourceType, setSourceType] = useState<"pdb_id" | "file">("pdb_id");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
    format: "cif" | "pdb";
    size: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTitle(initialData?.title ?? "");
      setDescription(initialData?.description ?? "");
      setPdbId(initialData?.activePdbId ?? "");
      setSourceType("pdb_id");
      setUploadedFile(null);
      setClientError(null);
      const timer = window.setTimeout(() => titleInputRef.current?.focus(), 0);
      return () => {
        window.clearTimeout(timer);
        openerRef.current?.focus({ preventScroll: true });
      };
    }
  }, [isOpen, initialData?.title, initialData?.description, initialData?.activePdbId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen && !isSaving) {
        onClose();
        return;
      }
      if (event.key === "Tab" && isOpen && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  function handleFileSelected(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setClientError("File exceeds the 10 MiB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      if (!text.includes("ATOM") && !text.includes("data_") && !text.includes("_atom_site")) {
        setClientError("The file does not appear to contain valid molecular structure records (ATOM or mmCIF).");
        return;
      }
      const format = detectStructureFormat(text);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const alnumOnly = cleanName.replace(/[^a-zA-Z0-9]/g, "");
      let derivedId = "UPL1";
      if (alnumOnly.length === 4) {
        derivedId = alnumOnly.toUpperCase();
      } else if (alnumOnly.length > 4) {
        derivedId = alnumOnly.slice(0, 4).toUpperCase();
      }
      setPdbId(derivedId);
      if (!title.trim()) {
        setTitle(cleanName);
      }
      setUploadedFile({
        name: file.name,
        content: text,
        format,
        size: file.size,
      });
      setClientError(null);
    };
    reader.onerror = () => {
      setClientError("Failed to read the selected file.");
    };
    reader.readAsText(file);
  }

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

    if (sourceType === "file" && uploadedFile) {
      if (!normalizedPdb || !/^[A-Z0-9]{4}$/.test(normalizedPdb)) {
        setClientError("PDB ID must contain exactly 4 alphanumeric characters (e.g. UPL1).");
        return;
      }
      setClientError(null);
      onSave({
        title: trimmedTitle,
        description: description.trim(),
        pdbId: normalizedPdb,
        fileData: {
          name: uploadedFile.name,
          content: uploadedFile.content,
          format: uploadedFile.format,
        },
      });
      return;
    }

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
        aria-describedby={displayedError ? "project-dialog-error" : undefined}
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
            <div id="project-dialog-error" className="bf-modal-error" role="alert">
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
              aria-invalid={Boolean(clientError)}
              aria-describedby={displayedError ? "project-dialog-error" : undefined}
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
              <div className="bf-dialog-tabs" role="tablist" aria-label="Structure Source">
                <button
                  type="button"
                  role="tab"
                  className={`bf-dialog-tab ${sourceType === "pdb_id" ? "is-active" : ""}`}
                  onClick={() => { setSourceType("pdb_id"); setClientError(null); }}
                  aria-selected={sourceType === "pdb_id"}
                >
                  PDB Archive Code
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`bf-dialog-tab ${sourceType === "file" ? "is-active" : ""}`}
                  onClick={() => { setSourceType("file"); setClientError(null); }}
                  aria-selected={sourceType === "file"}
                >
                  Upload File (.pdb / .cif)
                </button>
              </div>

              {sourceType === "pdb_id" ? (
                <div>
                  <input
                    id="project-pdb-input"
                    type="text"
                    value={pdbId}
                    onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                    placeholder="e.g., 1CRN, 4HHB or 7C22"
                    maxLength={4}
                    disabled={isSaving}
                  />
                  <span className="bf-form-hint">Leave blank to start with default Crambin.</span>
                </div>
              ) : (
                <div>
                  <div
                    className={`bf-file-dropzone ${isDragging ? "is-dragover" : ""} ${uploadedFile ? "has-file" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileSelected(file);
                    }}
                    onClick={() => {
                      if (!uploadedFile) fileInputRef.current?.click();
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdb,.cif,.ent,.txt"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelected(file);
                      }}
                    />
                    {!uploadedFile ? (
                      <div className="bf-dropzone-prompt">
                        <Upload size={24} className="bf-dropzone-icon" />
                        <span className="bf-dropzone-text">
                          <strong>Choose a PDB/CIF file</strong> or drag & drop here
                        </span>
                        <span className="bf-dropzone-sub">Supports .pdb, .cif, .ent up to 10 MiB</span>
                      </div>
                    ) : (
                      <div className="bf-uploaded-file-card">
                        <div className="bf-uploaded-file-info">
                          <FileText size={20} className="bf-file-icon" />
                          <div>
                            <strong className="bf-file-name">{uploadedFile.name}</strong>
                            <span className="bf-file-meta">
                              {uploadedFile.format.toUpperCase()} · {(uploadedFile.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="bf-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          aria-label="Remove uploaded file"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {uploadedFile && (
                    <div style={{ marginTop: 12 }}>
                      <label htmlFor="custom-pdb-id" style={{ fontSize: 12, marginBottom: 4 }}>
                        Assigned PDB ID Code <span className="bf-required">*</span>
                      </label>
                      <input
                        id="custom-pdb-id"
                        type="text"
                        value={pdbId}
                        maxLength={4}
                        onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                        placeholder="e.g. UPL1"
                        disabled={isSaving}
                        required
                      />
                      <span className="bf-form-hint">
                        4-character code used by the 3D viewer, workspace, and explorer.
                      </span>
                    </div>
                  )}
                </div>
              )}
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
