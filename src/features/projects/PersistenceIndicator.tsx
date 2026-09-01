import { Check, CloudOff, AlertTriangle, AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import type { PersistenceState } from "./types";

export interface PersistenceIndicatorProps {
  status: PersistenceState;
  revision?: number;
  lastSavedAt?: string;
  onResolveConflict?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function PersistenceIndicator({
  status,
  revision,
  lastSavedAt,
  onResolveConflict,
  onRetry,
  className = "",
}: PersistenceIndicatorProps) {
  if (status === "idle" && !revision) {
    return null;
  }

  return (
    <div
      className={`bf-persistence-indicator bf-persistence-${status} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Storage status: ${status}`}
    >
      {status === "saving" && (
        <span className="bf-indicator-badge is-saving">
          <LoaderCircle size={14} className="bf-spin" aria-hidden="true" />
          <span>Saving…</span>
        </span>
      )}

      {status === "saved" && (
        <span className="bf-indicator-badge is-saved">
          <Check size={14} aria-hidden="true" />
          <span>
            Saved {revision ? `· Rev ${revision}` : ""}
            {lastSavedAt ? ` (${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}
          </span>
        </span>
      )}

      {status === "offline" && (
        <span className="bf-indicator-badge is-offline">
          <CloudOff size={14} aria-hidden="true" />
          <span>Offline mode</span>
        </span>
      )}

      {status === "conflict" && (
        <span className="bf-indicator-badge is-conflict">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>Version conflict</span>
          {onResolveConflict && (
            <button
              type="button"
              className="bf-indicator-action"
              onClick={onResolveConflict}
              aria-label="Resolve project version conflict"
            >
              <RefreshCw size={12} aria-hidden="true" /> Resolve
            </button>
          )}
        </span>
      )}

      {status === "error" && (
        <span className="bf-indicator-badge is-error">
          <AlertCircle size={14} aria-hidden="true" />
          <span>Sync failed</span>
          {onRetry && (
            <button
              type="button"
              className="bf-indicator-action"
              onClick={onRetry}
              aria-label="Retry project synchronization"
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
