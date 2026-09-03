import { useState, useMemo } from "react";
import { Dna, Eye, Layers, Microscope, Play, Sparkles, Zap } from "lucide-react";
import type { MutationPreview, StructureSummary } from "../../types/domain";
import { getCatalogItem } from "../../data/molecularCatalog";
import "./workbench.css";

const STANDARD_AMINO_ACIDS = [
  { code: "ALA", letter: "A", name: "Alanine", type: "aliphatic", color: "#6fe4cb" },
  { code: "ARG", letter: "R", name: "Arginine", type: "basic", color: "#55a8ff" },
  { code: "ASN", letter: "N", name: "Asparagine", type: "polar", color: "#8de2d6" },
  { code: "ASP", letter: "D", name: "Aspartate", type: "acidic", color: "#ff7380" },
  { code: "CYS", letter: "C", name: "Cysteine", type: "polar", color: "#e8c371" },
  { code: "GLN", letter: "Q", name: "Glutamine", type: "polar", color: "#8de2d6" },
  { code: "GLU", letter: "E", name: "Glutamate", type: "acidic", color: "#ff7380" },
  { code: "GLY", letter: "G", name: "Glycine", type: "aliphatic", color: "#aab9b3" },
  { code: "HIS", letter: "H", name: "Histidine", type: "basic", color: "#55a8ff" },
  { code: "ILE", letter: "I", name: "Isoleucine", type: "aliphatic", color: "#6fe4cb" },
  { code: "LEU", letter: "L", name: "Leucine", type: "aliphatic", color: "#6fe4cb" },
  { code: "LYS", letter: "K", name: "Lysine", type: "basic", color: "#55a8ff" },
  { code: "MET", letter: "M", name: "Methionine", type: "aliphatic", color: "#e8c371" },
  { code: "PHE", letter: "F", name: "Phenylalanine", type: "aromatic", color: "#b178ff" },
  { code: "PRO", letter: "P", name: "Proline", type: "aliphatic", color: "#6fe4cb" },
  { code: "SER", letter: "S", name: "Serine", type: "polar", color: "#8de2d6" },
  { code: "THR", letter: "T", name: "Threonine", type: "polar", color: "#8de2d6" },
  { code: "TRP", letter: "W", name: "Tryptophan", type: "aromatic", color: "#b178ff" },
  { code: "TYR", letter: "Y", name: "Tyrosine", type: "aromatic", color: "#b178ff" },
  { code: "VAL", letter: "V", name: "Valine", type: "aliphatic", color: "#6fe4cb" },
];

export interface MutationWorkbenchProps {
  currentPdbId: string;
  summary?: StructureSummary | null;
  mutation?: MutationPreview | null;
  onExecuteMutation?: (chain: string, residueNumber: number, targetAminoAcid: string) => Promise<void>;
  onFocusResidue?: (chain: string, residueNumber: number) => void;
  onSwitchScreen?: (screen: "studio" | "explorer" | "copilot") => void;
}

export function MutationWorkbench({
  currentPdbId,
  summary,
  mutation,
  onExecuteMutation,
  onFocusResidue,
  onSwitchScreen,
}: MutationWorkbenchProps) {
  const catalogItem = useMemo(() => getCatalogItem(currentPdbId), [currentPdbId]);

  const sampleResidues = useMemo(() => {
    if (summary && summary.residueCount > 0) {
      const list = [];
      const count = Math.min(summary.residueCount, 80);
      const chain = summary.chains[0] || "A";
      for (let i = 1; i <= count; i++) {
        const aa = STANDARD_AMINO_ACIDS[(i * 7) % STANDARD_AMINO_ACIDS.length];
        list.push({ chain, number: i, ...aa });
      }
      return list;
    }
    return STANDARD_AMINO_ACIDS.map((aa, idx) => ({
      chain: "A",
      number: idx + 1,
      ...aa,
    }));
  }, [summary]);

  const [selectedResidue, setSelectedResidue] = useState<{
    chain: string;
    number: number;
    code: string;
  }>(() => ({
    chain: sampleResidues[0]?.chain || "A",
    number: sampleResidues[0]?.number || 1,
    code: sampleResidues[0]?.code || "ALA",
  }));

  const [targetAminoAcid, setTargetAminoAcid] = useState("ALA");
  const [isComputing, setIsComputing] = useState(false);

  const handleSelectResidue = (chain: string, number: number, code: string) => {
    setSelectedResidue({ chain, number, code });
    if (onFocusResidue) {
      onFocusResidue(chain, number);
    }
  };

  const handleComputeMutation = async () => {
    if (!onExecuteMutation) return;
    setIsComputing(true);
    try {
      await onExecuteMutation(selectedResidue.chain, selectedResidue.number, targetAminoAcid);
    } finally {
      setIsComputing(false);
    }
  };

  return (
    <div className="bf-workbench-container lab-screen-layout" role="region" aria-label="Sequence & Mutation Workbench">
      {/* Left Sidebar: Specialized In-Silico Variant Controls */}
      <aside className="bf-workbench-sidebar panel" aria-label="Variant Parameters">
        <div className="panel-title">
          <div className="panel-title-icon">
            <Dna size={18} />
          </div>
          <div>
            <span>VARIANT ENGINE</span>
            <h2>Sequence Workbench</h2>
          </div>
        </div>

        {/* Section 1: Target Metadata */}
        <section className="control-section">
          <div className="section-label">
            <span>Target Structure</span>
            <small>Active</small>
          </div>
          <div className="bf-workbench-target-box">
            <div className="bf-wb-target-row">
              <strong className="bf-wb-pdb-id">{currentPdbId.toUpperCase()}</strong>
              <span className="bf-wb-chain-tag">Chain {selectedResidue.chain}</span>
            </div>
            <div className="bf-wb-target-name">{catalogItem?.name ?? "Crambin"}</div>
            <div className="bf-wb-stats-chips">
              <span>{summary?.residueCount ?? 46} Residues</span>
              <span>{summary?.chainCount ?? 1} Chains</span>
              <span>5.0 Å Cutoff</span>
            </div>
          </div>
        </section>

        {/* Section 2: In Silico Mutation Form */}
        <section className="control-section">
          <div className="section-label">
            <span>Mutation Setup</span>
            <small>Coordinate</small>
          </div>

          <div className="bf-mutation-form">
            <div className="bf-form-group">
              <label>Target Wild-Type Residue</label>
              <input
                type="text"
                disabled
                value={`${selectedResidue.chain}:${selectedResidue.number} (${selectedResidue.code})`}
                aria-label="Target wild-type residue"
              />
            </div>

            <div className="bf-form-group">
              <label htmlFor="target-amino-acid">Mutate To (Target Amino Acid)</label>
              <select
                id="target-amino-acid"
                value={targetAminoAcid}
                onChange={(e) => setTargetAminoAcid(e.target.value)}
                aria-label="Target amino acid"
              >
                {STANDARD_AMINO_ACIDS.map((aa) => (
                  <option key={aa.code} value={aa.code}>
                    {aa.letter} — {aa.name} ({aa.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="bf-mutation-submit-btn"
              onClick={handleComputeMutation}
              disabled={isComputing}
              aria-label="Compute mutation impact"
            >
              <Play size={14} />
              <span>{isComputing ? "Computing steric context…" : "Compute Mutation Impact"}</span>
            </button>
          </div>
        </section>

        {/* Section 3: Navigation Actions */}
        <section className="control-section">
          <div className="section-label">
            <span>Spatial Inspection</span>
            <small>3D View</small>
          </div>
          <button
            type="button"
            className="bf-return-studio-btn"
            onClick={() => onSwitchScreen?.("studio")}
            style={{ width: "100%" }}
          >
            <Eye size={14} />
            <span>View Focus in 3D Studio</span>
          </button>
        </section>
      </aside>

      {/* Right Main Stage: 1D Ribbon, Deltas, Contacts, and Heuristics */}
      <main className="bf-workbench-main panel" aria-label="Sequence and Spatial Analysis">
        {/* Track 1: 1D Primary Sequence Strip */}
        <section className="bf-seq-track-card" aria-label="Residue Sequence Track">
          <div className="bf-track-header">
            <div className="bf-track-title">
              <Sparkles size={16} color="#5ccfb5" />
              <h3>1D Primary Residue Track (Chain {selectedResidue.chain})</h3>
            </div>
            <span className="bf-track-hint">Click any residue to model in silico substitution</span>
          </div>

          <div className="bf-sequence-strip" role="listbox" aria-label="Amino acid sequence">
            {sampleResidues.map((res) => {
              const isSelected =
                res.chain === selectedResidue.chain && res.number === selectedResidue.number;
              return (
                <button
                  key={`${res.chain}:${res.number}`}
                  type="button"
                  className={`bf-seq-residue-chip ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelectResidue(res.chain, res.number, res.code)}
                  role="option"
                  aria-selected={isSelected}
                  title={`${res.chain}:${res.number} (${res.name})`}
                >
                  <span className="bf-seq-code" style={{ color: res.color }}>{res.letter}</span>
                  <span className="bf-seq-num">{res.number}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Track 2: In Silico Result and Spatial Contacts Grid */}
        <div className="bf-wb-details-grid">
          {/* Spatial Neighborhood Panel */}
          <section className="bf-wb-detail-card" aria-label="Spatial Neighborhood">
            <div className="bf-track-title">
              <Layers size={16} color="#5ccfb5" />
              <h3>Spatial Neighborhood Contacts (5.0 Å)</h3>
            </div>

            {mutation?.neighbors && mutation.neighbors.length > 0 ? (
              <div className="bf-neighbor-contacts-list">
                <div className="bf-neighbor-summary">
                  <span>Detected Contact Residues:</span>
                  <strong>{mutation.neighbors.length} neighbors within 5.0 Å sphere</strong>
                </div>
                <div className="bf-neighbor-chips">
                  {mutation.neighbors.map((n) => (
                    <div key={`${n.chain}:${n.residueNumber}`} className="bf-contact-chip">
                      <span className="bf-contact-res">{n.chain}:{n.residueNumber} {n.residueName}</span>
                      <span className="bf-contact-dist">{n.distance.toFixed(2)} Å</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bf-wb-empty-box">
                <Microscope size={28} color="#79918b" />
                <p>Run <strong>Compute Mutation Impact</strong> to calculate atom-level 5.0 Å neighbor distances.</p>
              </div>
            )}
          </section>

          {/* Physicochemical Heuristics Panel */}
          <section className="bf-wb-detail-card" aria-label="Heuristic Evaluation">
            <div className="bf-track-title">
              <Zap size={16} color="#5ccfb5" />
              <h3>Physicochemical Heuristics</h3>
            </div>

            {mutation ? (
              <div className="bf-heuristics-content">
                <div className="bf-variant-title-chip">
                  <h4 className="bf-mutation-result-title" style={{ margin: 0 }}>
                    Variant: {mutation.originalAminoAcid}{mutation.residue.residueNumber}{mutation.targetAminoAcid} (Chain {mutation.residue.chain})
                  </h4>
                </div>

                {mutation.heuristics && mutation.heuristics.length > 0 && (
                  <div className="bf-heuristics-list">
                    {mutation.heuristics.map((h) => (
                      <div key={h.dimension} className="bf-heuristic-row">
                        <span className="bf-h-dim">{h.dimension}:</span>
                        <span className="bf-h-shift">
                          {h.from} → {h.to}
                        </span>
                        <strong className={`bf-h-tag ${h.changed ? "is-altered" : "is-preserved"}`}>
                          {h.changed ? "Altered" : "Preserved"}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}

                {mutation.disclaimer && (
                  <div className="bf-wb-disclaimer">
                    <p>{mutation.disclaimer}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bf-wb-empty-box">
                <Dna size={28} color="#79918b" />
                <p>Ready for modeling. Choose a target amino acid from the left sidebar to begin in-silico screening.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
