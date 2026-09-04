import { useState, useEffect } from "react";
import { Share2, X, Copy, Check, Shield, Globe, ExternalLink } from "lucide-react";
import { enableProjectSharing, disableProjectSharing } from "../../services/sharingService";
import "./share.css";

export interface ShareProjectModalProps {
  isOpen: boolean;
  projectId: string;
  projectTitle: string;
  isPublicInitial?: boolean;
  shareTokenInitial?: string | null;
  onClose: () => void;
}

export function ShareProjectModal({
  isOpen,
  projectId,
  projectTitle,
  isPublicInitial = false,
  shareTokenInitial = null,
  onClose,
}: ShareProjectModalProps) {
  const [isPublic, setIsPublic] = useState(isPublicInitial);
  const [shareToken, setShareToken] = useState(shareTokenInitial);
  const [isCopied, setIsCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setIsPublic(isPublicInitial);
    setShareToken(shareTokenInitial);
  }, [isPublicInitial, shareTokenInitial]);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://biofold-orpin.vercel.app";
  const shareUrl = shareToken ? `${origin}/share/${shareToken}` : "";

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      if (!isPublic) {
        const { shareToken: newToken } = await enableProjectSharing(projectId);
        setShareToken(newToken);
        setIsPublic(true);
      } else {
        await disableProjectSharing(projectId);
        setIsPublic(false);
        setShareToken(null);
      }
    } catch (err) {
      console.warn("Failed to toggle sharing:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch {
      /* fallback */
    }
  };

  return (
    <div className="bf-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <div className="bf-share-modal-card">
        <div className="bf-share-modal-header">
          <div className="bf-share-modal-title">
            <Share2 size={18} />
            <span id="share-modal-title">Share Research Project</span>
          </div>
          <button
            type="button"
            className="bf-share-modal-close-btn"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <span style={{ fontSize: "12px", color: "var(--bf-muted, #79918b)" }}>Workspace:</span>
          <strong style={{ display: "block", color: "#fff", fontSize: "14px", marginTop: "2px" }}>
            {projectTitle || "Molecular Research Project"}
          </strong>
        </div>

        {/* Toggle Row */}
        <div className="bf-share-toggle-row">
          <div className="bf-share-toggle-info">
            <strong>Public Read-Only Link</strong>
            <span>Anyone with the secret link can inspect the 3D structure and notes</span>
          </div>

          <label className="bf-switch-label">
            <input
              type="checkbox"
              checked={isPublic}
              disabled={isUpdating}
              onChange={handleToggle}
              aria-label="Toggle public read-only link"
            />
            <span className="bf-switch-slider" />
          </label>
        </div>

        {/* Link Box */}
        {isPublic && shareUrl && (
          <div className="bf-share-link-box">
            <span className="bf-share-link-label">Shareable Link</span>
            <div className="bf-share-input-group">
              <input
                className="bf-share-input"
                readOnly
                value={shareUrl}
                aria-label="Public share link"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="bf-share-copy-btn"
                onClick={handleCopy}
                title="Copy share link to clipboard"
              >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>{isCopied ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}

        <div className="bf-share-meta-notes">
          <Shield size={14} style={{ color: "var(--bf-accent, #5ccfb5)", flexShrink: 0 }} />
          <span>
            {isPublic
              ? "Viewers have read-only permissions and cannot modify or overwrite your workspace."
              : "Sharing is disabled. Only your account can view and edit this workspace."}
          </span>
        </div>
      </div>
    </div>
  );
}
