import { Info } from "lucide-react";
import { EVIDENCE_CLASSES } from "./landingContent";

export function EvidenceSection() {
  return (
    <section className="bf-section bf-container bf-limits" aria-labelledby="limits-title">
      <div className="bf-section-heading">
        <div>
          <span className="bf-eyebrow">04 / Scientific clarity</span>
          <h2 id="limits-title">Know what the view can tell you.</h2>
        </div>
        <p>Every result carries the label it earned. Nothing is dressed up as more than it is.</p>
      </div>

      <div className="bf-evidence-grid">
        {EVIDENCE_CLASSES.map((entry) => (
          <div key={entry.label}>
            <span className={entry.tone === "amber" ? "bf-amber" : undefined}>{entry.label}</span>
            <p>{entry.body}</p>
          </div>
        ))}
      </div>

      <p className="bf-limit-note">
        <Info size={17} aria-hidden="true" />
        BioFold does not predict folding, stability, binding affinity or clinical outcomes.
      </p>
    </section>
  );
}
