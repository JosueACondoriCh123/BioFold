import { Layers3, Ruler, ScanLine } from "lucide-react";
import { CAPABILITIES } from "./landingContent";

const ICONS = [Layers3, ScanLine, Ruler];

export function CapabilitiesSection() {
  return (
    <section className="bf-section bf-container" id="explore" aria-labelledby="explore-title">
      <div className="bf-section-heading">
        <div>
          <span className="bf-eyebrow">01 / A closer look</span>
          <h2 id="explore-title">From structure to understanding.</h2>
        </div>
        <p>Clear controls. Useful context. Every change reflected in the scene.</p>
      </div>

      <div className="bf-explore">
        <figure className="bf-preview">
          <div className="bf-preview-heading">
            <span>Inside the laboratory</span>
            <span className="bf-tag">Structure preview</span>
          </div>
          <img
            src="/4hhb-preview.png"
            width="840"
            height="812"
            decoding="async"
            alt="Actual BioFold view of 4HHB, showing four hemoglobin chains in a cartoon representation"
          />
          <figcaption>
            <strong>4HHB <span>Hemoglobin</span></strong>
            <span>Actual laboratory capture · RCSB fixture</span>
          </figcaption>
        </figure>

        <div className="bf-capabilities">
          {CAPABILITIES.map((capability, index) => {
            const Icon = ICONS[index];
            return (
              <article key={capability.title}>
                <span className={`bf-feature-icon${capability.tone === "rose" ? " bf-icon-rose" : ""}`}>
                  <Icon aria-hidden="true" />
                </span>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
                <span className="bf-feature-detail">{capability.detail}</span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
