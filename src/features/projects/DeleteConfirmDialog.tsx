import { useEffect, useRef } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

export interface DeleteConfirmDialogProps {
  isOpen: boolean;
  projectTitle: string;
  isDeleting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  projectTitle,
  isDeleting = false,
  error = null,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const timer = window.setTimeout(() => cancelBtnRef.current?.focus(), 0);
      return () => {
        window.clearTimeout(timer);
        openerRef.current?.focus({ preventScroll: true });
      };
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen && !isDeleting) {
        onCancel();
        return;
      }
      if (event.key === "Tab" && isOpen && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
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
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="bf-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="bf-modal-dialog bf-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby={error ? "delete-dialog-desc delete-dialog-error" : "delete-dialog-desc"}
      >
        <div className="bf-confirm-header">
          <div className="bf-danger-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
          <h2 id="delete-dialog-title">Delete project</h2>
        </div>

        <p id="delete-dialog-desc" className="bf-confirm-body">
          Are you sure you want to delete <strong>“{projectTitle}”</strong>? This action will permanently remove all saved 3D scene snapshots, distance measurements, and activity logs.
        </p>

        {error && <p id="delete-dialog-error" className="bf-modal-error" role="alert">{error}</p>}

        <footer className="bf-modal-footer">
          <button
            ref={cancelBtnRef}
            type="button"
            className="bf-button bf-button-ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bf-button bf-button-danger"
            onClick={onConfirm}
            disabled={isDeleting}
            aria-label={`Confirm deletion of ${projectTitle}`}
          >
            {isDeleting ? (
              <>
                <LoaderCircle size={16} className="bf-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete project"
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
