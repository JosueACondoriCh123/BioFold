import { useState, useEffect } from "react";
import {
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Activity,
  ShieldAlert,
  Flame,
  Link as LinkIcon,
  LoaderCircle,
} from "lucide-react";
import { getBiologicalAnnotations } from "../../services/uniprotAnnotationService";
import type { ProteinAnnotations } from "../../types/domain";
import "./annotations.css";

export interface BiologicalAnnotationsSectionProps {
  pdbId: string;
  onHighlightResidues: (residues: { chain: string; residueNumber: number }[]) => void;
  onInspectMutation?: (position: number, wildType: string, mutant: string) => void;
}

export function BiologicalAnnotationsSection({
  pdbId,
  onHighlightResidues,
  onInspectMutation,
}: BiologicalAnnotationsSectionProps) {
  const [annotations, setAnnotations] = useState<ProteinAnnotations | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeOpen, setActiveOpen] = useState(true);
  const [disulfideOpen, setDisulfideOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pdbId) return;
      setLoading(true);
      try {
        const data = await getBiologicalAnnotations(pdbId);
        if (!cancelled) setAnnotations(data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pdbId]);

  if (loading) {
    return (
      <div className="bf-annotations-section">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--bf-muted, #79918b)" }}>
          <LoaderCircle size={14} className="spin" />
          <span>Fetching UniProt & ClinVar functional annotations…</span>
        </div>
      </div>
    );
  }

  if (!annotations) return null;

  const handleHighlightAllActiveSites = () => {
    if (!annotations.activeSites.length) return;
    onHighlightResidues(
      annotations.activeSites.map((s) => ({ chain: s.chain, residueNumber: s.residueNumber })),
    );
  };

  return (
    <section className="bf-annotations-section" aria-labelledby="biological-annotations-title">
      <header className="bf-annotations-header">
        <div className="bf-annotations-header-title">
          <Sparkles size={16} aria-hidden="true" />
          <h4 id="biological-annotations-title">Biological Annotations</h4>
        </div>
        {annotations.uniprotAccession && (
          <a
            href={`https://www.uniprot.org/uniprotkb/${annotations.uniprotAccession}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bf-uniprot-link-btn"
            title="Open entry on UniProtKB"
          >
            <span>UniProt: {annotations.uniprotAccession}</span>
            <ExternalLink size={11} />
          </a>
        )}
      </header>

      {/* Protein Metadata Card */}
      <div className="bf-protein-meta-box">
        <strong>{annotations.proteinName}</strong>
        {annotations.geneName && (
          <span style={{ color: "var(--bf-accent, #5ccfb5)", fontWeight: 600, fontSize: "11px" }}>
            Gene: {annotations.geneName} ·{" "}
          </span>
        )}
        <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>{annotations.organism}</span>
        {annotations.functionSummary && <p>{annotations.functionSummary}</p>}
      </div>

      {/* 1. Catalytic & Active Sites Accordion */}
      {annotations.activeSites.length > 0 && (
        <div className="bf-annotation-card">
          <button
            type="button"
            className="bf-annotation-card-btn"
            onClick={() => setActiveOpen(!activeOpen)}
            aria-expanded={activeOpen}
          >
            <div className="bf-annotation-card-label">
              <Flame size={14} style={{ color: "#f6ad55" }} />
              <span>Catalytic & Active Sites</span>
              <span className="bf-annotation-count-pill">{annotations.activeSites.length}</span>
            </div>
            {activeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {activeOpen && (
            <div className="bf-annotation-list">
              {annotations.activeSites.map((site, idx) => (
                <div key={`site-${idx}`} className="bf-annotation-row">
                  <div className="bf-annotation-row-info">
                    <span className="bf-annotation-res-badge">
                      {site.aminoAcid || "Res"} {site.chain}:{site.residueNumber}
                    </span>
                    <span className="bf-annotation-desc" title={site.description}>
                      {site.description}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="bf-annotation-action-btn"
                    onClick={() =>
                      onHighlightResidues([{ chain: site.chain, residueNumber: site.residueNumber }])
                    }
                    title="Highlight this residue in 3D"
                  >
                    <Sparkles size={11} />
                    <span>Focus 3D</span>
                  </button>
                </div>
              ))}

              {annotations.activeSites.length > 1 && (
                <button
                  type="button"
                  className="bf-highlight-all-btn"
                  onClick={handleHighlightAllActiveSites}
                >
                  <Sparkles size={12} />
                  <span>Highlight All Catalytic Sites</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Disulfide Bridges Accordion */}
      {annotations.disulfideBonds.length > 0 && (
        <div className="bf-annotation-card">
          <button
            type="button"
            className="bf-annotation-card-btn"
            onClick={() => setDisulfideOpen(!disulfideOpen)}
            aria-expanded={disulfideOpen}
          >
            <div className="bf-annotation-card-label">
              <LinkIcon size={14} style={{ color: "#63b3ed" }} />
              <span>Disulfide Bridges</span>
              <span className="bf-annotation-count-pill">{annotations.disulfideBonds.length}</span>
            </div>
            {disulfideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {disulfideOpen && (
            <div className="bf-annotation-list">
              {annotations.disulfideBonds.map((bond, idx) => (
                <div key={`disulf-${idx}`} className="bf-annotation-row">
                  <div className="bf-annotation-row-info">
                    <span className="bf-annotation-res-badge">
                      Cys{bond.residue1} – Cys{bond.residue2} ({bond.chain})
                    </span>
                    <span className="bf-annotation-desc">{bond.description}</span>
                  </div>
                  <button
                    type="button"
                    className="bf-annotation-action-btn"
                    onClick={() =>
                      onHighlightResidues([
                        { chain: bond.chain, residueNumber: bond.residue1 },
                        { chain: bond.chain, residueNumber: bond.residue2 },
                      ])
                    }
                    title="Focus disulfide pair in 3D"
                  >
                    <Sparkles size={11} />
                    <span>Focus Bond</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. ClinVar & Pathogenic Natural Variants Accordion */}
      {annotations.variants.length > 0 && (
        <div className="bf-annotation-card">
          <button
            type="button"
            className="bf-annotation-card-btn"
            onClick={() => setVariantsOpen(!variantsOpen)}
            aria-expanded={variantsOpen}
          >
            <div className="bf-annotation-card-label">
              <ShieldAlert size={14} style={{ color: "#fc8181" }} />
              <span>ClinVar & Pathogenic Variants</span>
              <span className="bf-annotation-count-pill">{annotations.variants.length}</span>
            </div>
            {variantsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {variantsOpen && (
            <div className="bf-annotation-list">
              {annotations.variants.map((v, idx) => (
                <div key={`var-${idx}`} className="bf-annotation-row">
                  <div className="bf-annotation-row-info">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="bf-annotation-res-badge">
                        {v.wildType}
                        {v.position}
                        {v.mutant}
                      </span>
                      <span
                        className={`bf-variant-pathogenic-badge ${
                          v.clinicalSignificance === "Pathogenic" ? "is-pathogenic" : "is-benign"
                        }`}
                      >
                        {v.clinicalSignificance || "Variant"}
                      </span>
                    </div>
                    <span className="bf-annotation-desc" title={v.consequence}>
                      {v.consequence}
                    </span>
                  </div>
                  {onInspectMutation && (
                    <button
                      type="button"
                      className="bf-annotation-action-btn"
                      onClick={() => onInspectMutation(v.position, v.wildType, v.mutant)}
                      title="Inspect mutation in Sequence Workbench"
                    >
                      <span>Workbench</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
