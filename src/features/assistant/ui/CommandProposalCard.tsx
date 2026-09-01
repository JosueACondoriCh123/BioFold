import { Check, X, Sparkles, CheckCircle2, LoaderCircle, AlertCircle } from "lucide-react";
import type { CommandProposal } from "../../../types/assistant";

export interface CommandProposalCardProps {
  proposal: CommandProposal;
  isApplied?: boolean;
  isDismissed?: boolean;
  isApplying?: boolean;
  error?: string;
  onApply: (proposal: CommandProposal) => void;
  onDismiss: (proposal: CommandProposal) => void;
}

function formatCommandName(cmd: string): string {
  return cmd.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderPayloadSummary(proposal: CommandProposal): string {
  const { command, input } = proposal;
  switch (command) {
    case "load_structure":
      return `PDB ID: ${(input as { pdbId: string }).pdbId}`;
    case "focus_residues": {
      const res = (input as { residues: Array<{ chain: string; residueNumber: number }> }).residues;
      return res.map((r) => `${r.chain}:${r.residueNumber}`).join(", ");
    }
    case "set_representation": {
      const p = input as { style: string; colorScheme: string };
      return `${p.style} · ${p.colorScheme}`;
    }
    case "show_surface": {
      const p = input as { visible: boolean; opacity?: number };
      return p.visible ? `Surface On (${Math.round((p.opacity ?? 0.72) * 100)}% opacity)` : "Surface Off";
    }
    case "measure_distance": {
      const p = input as { from: { chain: string; residueNumber: number; atomName: string }; to: { chain: string; residueNumber: number; atomName: string } };
      return `${p.from.chain}:${p.from.residueNumber}:${p.from.atomName} → ${p.to.chain}:${p.to.residueNumber}:${p.to.atomName}`;
    }
    case "preview_mutation_context": {
      const p = input as { residue: { chain: string; residueNumber: number }; toAminoAcid: string };
      return `${p.residue.chain}:${p.residue.residueNumber} → ${p.toAminoAcid}`;
    }
    case "reset_workspace": {
      const p = input as { scope: string };
      return `Scope: ${p.scope}`;
    }
    default:
      return JSON.stringify(input);
  }
}

export function CommandProposalCard({
  proposal,
  isApplied = false,
  isDismissed = false,
  isApplying = false,
  error,
  onApply,
  onDismiss,
}: CommandProposalCardProps) {
  if (isDismissed) {
    return (
      <div className="bf-proposal-card is-dismissed" aria-label={`Dismissed proposal: ${proposal.command}`}>
        <span className="bf-proposal-status-text">Proposal dismissed</span>
      </div>
    );
  }

  return (
    <div
      className={`bf-proposal-card ${isApplied ? "is-applied" : ""}`}
      aria-labelledby={`proposal-title-${proposal.id}`}
    >
      <div className="bf-proposal-header">
        <div className="bf-proposal-badge">
          <Sparkles size={13} aria-hidden="true" />
          <span id={`proposal-title-${proposal.id}`}>
            {formatCommandName(proposal.command)}
          </span>
        </div>
        <span className="bf-proposal-tag">Proposed Action</span>
      </div>

      <p className="bf-proposal-rationale">{proposal.rationale}</p>

      <div className="bf-proposal-payload">
        <span className="bf-payload-label">Parameters:</span>
        <code className="bf-payload-value">{renderPayloadSummary(proposal)}</code>
      </div>

      <div className="bf-proposal-actions">
        {isApplied ? (
          <span className="bf-proposal-applied-badge">
            <CheckCircle2 size={14} aria-hidden="true" /> Applied to scene
          </span>
        ) : (
          <>
            <button
              type="button"
              className="bf-button bf-proposal-apply-btn"
              onClick={() => onApply(proposal)}
              disabled={isApplying}
              aria-label={`Apply proposed command ${formatCommandName(proposal.command)}`}
            >
              {isApplying ? <LoaderCircle className="bf-spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              {isApplying ? "Applying…" : "Apply"}
            </button>
            <button
              type="button"
              className="bf-button bf-button-ghost bf-proposal-dismiss-btn"
              onClick={() => onDismiss(proposal)}
              disabled={isApplying}
              aria-label={`Dismiss proposal ${formatCommandName(proposal.command)}`}
            >
              <X size={14} aria-hidden="true" /> Dismiss
            </button>
          </>
        )}
      </div>
      {error && <div className="bf-proposal-error" role="alert"><AlertCircle size={13} aria-hidden="true" />{error}</div>}
    </div>
  );
}
