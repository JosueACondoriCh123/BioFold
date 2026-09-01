import {
  Layers3,
  Ruler,
  Dna,
  Activity,
  Bot,
  User,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import type {
  ActivityEntry,
  DistanceMeasurement,
  MutationPreview,
  StructureSummary,
} from "../../../types/domain";

export interface ResultsTabProps {
  summary?: StructureSummary | null;
  measurement?: DistanceMeasurement | null;
  mutation?: MutationPreview | null;
  activityEntries?: ActivityEntry[];
}

export function ResultsTab({
  summary,
  measurement,
  mutation,
  activityEntries = [],
}: ResultsTabProps) {
  const hasContent = summary || measurement || mutation || activityEntries.length > 0;

  if (!hasContent) {
    return (
      <div className="bf-results-empty" role="region" aria-label="No scientific results yet">
        <Layers3 size={32} aria-hidden="true" />
        <h4>No analysis results yet</h4>
        <p>
          Load a structure, take distance measurements, or preview amino acid mutations to inspect quantitative findings here.
        </p>
      </div>
    );
  }

  return (
    <div className="bf-results-pane" role="region" aria-label="Scientific Results and Scene Inspection">
      {/* 1. Structure Summary */}
      {summary && (
        <section className="bf-results-section" aria-labelledby="summary-card-title">
          <header className="bf-results-section-header">
            <Layers3 size={16} aria-hidden="true" />
            <h4 id="summary-card-title">Structure Composition</h4>
            <span className="bf-evidence-tag is-calculated">Calculated</span>
          </header>
          <div className="bf-summary-stats-grid">
            <div className="bf-stat-card">
              <span className="bf-stat-value">{summary.chainCount}</span>
              <span className="bf-stat-label">Chains</span>
            </div>
            <div className="bf-stat-card">
              <span className="bf-stat-value">{summary.residueCount}</span>
              <span className="bf-stat-label">Residues</span>
            </div>
            <div className="bf-stat-card">
              <span className="bf-stat-value">{summary.atomCount}</span>
              <span className="bf-stat-label">Atoms</span>
            </div>
            <div className="bf-stat-card">
              <span className="bf-stat-value">{summary.waterCount}</span>
              <span className="bf-stat-label">Waters</span>
            </div>
          </div>
        </section>
      )}

      {/* 2. Active Distance Measurement */}
      {measurement && (
        <section className="bf-results-section" aria-labelledby="measurement-card-title">
          <header className="bf-results-section-header">
            <Ruler size={16} aria-hidden="true" />
            <h4 id="measurement-card-title">Atomic Distance</h4>
            <span className="bf-evidence-tag is-calculated">Calculated</span>
          </header>
          <div className="bf-measurement-display">
            <span className="bf-distance-big">{measurement.angstroms.toFixed(2)} Å</span>
            <div className="bf-distance-endpoints">
              <span>
                <strong>From:</strong> {measurement.from.chain}:{measurement.from.residueNumber} ({measurement.from.atomName})
              </span>
              <span>
                <strong>To:</strong> {measurement.to.chain}:{measurement.to.residueNumber} ({measurement.to.atomName})
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 3. Mutation Preview Context */}
      {mutation && (
        <section className="bf-results-section" aria-labelledby="mutation-card-title">
          <header className="bf-results-section-header">
            <Dna size={16} aria-hidden="true" />
            <h4 id="mutation-card-title">Mutation Context</h4>
            <span className="bf-evidence-tag is-heuristic">Heuristic Context</span>
          </header>
          <div className="bf-mutation-details">
            <div className="bf-mutation-target-pill">
              <span>Target:</span>
              <strong>
                {mutation.residue.chain}:{mutation.residue.residueNumber} {mutation.originalAminoAcid} → {mutation.targetAminoAcid}
              </strong>
            </div>

            <div className="bf-mutation-heuristics">
              {mutation.heuristics.map((h, i) => (
                <div key={i} className={`bf-heuristic-row ${h.changed ? "is-changed" : ""}`}>
                  <span className="bf-heuristic-dim">{h.dimension}:</span>
                  <span className="bf-heuristic-note">{h.note}</span>
                </div>
              ))}
            </div>

            <div className="bf-neighbors-summary">
              <Sparkles size={13} aria-hidden="true" />
              <span>{mutation.neighbors.length} spatial neighbor residues identified within 5.0 Å.</span>
            </div>

            <p className="bf-scientific-disclaimer">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>{mutation.disclaimer}</span>
            </p>
          </div>
        </section>
      )}

      {/* 4. Live Activity Stream / Provenance */}
      {activityEntries.length > 0 && (
        <section className="bf-results-section" aria-labelledby="activity-card-title">
          <header className="bf-results-section-header">
            <Activity size={16} aria-hidden="true" />
            <h4 id="activity-card-title">Activity Audit Trail</h4>
            <span className="bf-activity-count-badge">{activityEntries.length}</span>
          </header>
          <ul className="bf-activity-timeline" role="list">
            {activityEntries.slice(0, 10).map((entry) => (
              <li key={entry.id} className={`bf-activity-row is-${entry.status}`}>
                <div className="bf-activity-origin-icon" aria-label={`Origin: ${entry.origin}`}>
                  {entry.origin === "agent" ? <Bot size={13} /> : <User size={13} />}
                </div>
                <div className="bf-activity-info">
                  <strong className="bf-activity-command">{entry.command}</strong>
                  <span className="bf-activity-msg">{entry.message}</span>
                </div>
                <span className="bf-activity-duration">{entry.durationMs}ms</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
