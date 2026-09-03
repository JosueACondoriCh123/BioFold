import { useState, useMemo } from "react";
import { Dna, Eye, Play, Sparkles } from "lucide-react";
import type { MutationPreview, StructureSummary } from "../../types/domain";
import { getCatalogItem } from "../../data/molecularCatalog";
import "./workbench.css";

const STANDARD_AMINO_ACIDS = [
  { code: "ALA", letter: "A", name: "Alanine" },
  { code: "ARG", letter: "R", name: "Arginine" },
  { code: "ASN", letter: "N", name: "Asparagine" },
  { code: "ASP", letter: "D", name: "Aspartate" },
  { code: "CYS", letter: "C", name: "Cysteine" },
  { code: "GLN", letter: "Q", name: "Glutamine" },
  { code: "GLU", letter: "E", name: "Glutamate" },
  { code: "GLY", letter: "G", name: "Glycine" },
  { code: "HIS", letter: "H", name: "Histidine" },
  { code: "ILE", letter: "I", name: "Isoleucine" },
  { code: "LEU", letter: "L", name: "Leucine" },
  { code: "LYS", letter: "K", name: "Lysine" },
  { code: "MET", letter: "M", name: "Methionine" },
  { code: "PHE", letter: "F", name: "Phenylalanine" },
  { code: "PRO", letter: "P", name: "Proline" },
  { code: "SER", letter: "S", name: "Serine" },
  { code: "THR", letter: "T", name: "Threonine" },
  { code: "TRP", letter: "W", name: "Tryptophan" },
  { code: "TYR", letter: "Y", name: "Tyrosine" },
  { code: "VAL", letter: "V", name: "Valine" },
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

  // Derive residue list from summary or create representative sample sequence
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
    <div className="bf-workbench-container" role="region" aria-label="Sequence & Mutation Workbench">
      <header className="bf-workbench-header">
        <h2>
          <Dna size={22} color="#5CCFB5" />
          Sequence & In Silico Mutation Workbench
        </h2>
        <p>
          Target: <strong>{currentPdbId}</strong> · {catalogItem?.name ?? "Custom Structure"} (
          {summary ? `${summary.residueCount} residues, ${summary.atomCount} atoms` : "Loading structure summary..."}
          )
        </p>
      </header>

      <div className="bf-workbench-grid">
        {/* Left: Sequence Strip */}
        <section className="bf-workbench-panel" aria-label="Residue Sequence Track">
          <h3 className="bf-workbench-panel-title">
            <Sparkles size={16} color="#5ccfb5" />
            1D Primary Residue Track (Chain {selectedResidue.chain})
          </h3>
          <p style={{ margin: 0, fontSize: "12px", color: "#aab9b3" }}>
            Click on any residue along the chain to select it for in silico mutation modeling or 3D spatial alignment.
          </p>

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
                  <span className="bf-seq-code">{res.letter}</span>
                  <span className="bf-seq-num">{res.number}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
            {onSwitchScreen && (
              <button
                type="button"
                className="bf-mol-action-btn-secondary"
                onClick={() => onSwitchScreen("studio")}
                style={{ flex: 1 }}
              >
                <Eye size={14} />
                <span>View Focus in 3D Studio</span>
              </button>
            )}
          </div>
        </section>

        {/* Right: In Silico Mutation Panel */}
        <section className="bf-workbench-panel" aria-label="In Silico Mutation Form">
          <h3 className="bf-workbench-panel-title">
            <Dna size={16} color="#5ccfb5" />
            In Silico Variant Modeling
          </h3>

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

          {mutation ? (
            <div className="bf-mutation-result-box" aria-label="Mutation preview results">
              <h4 className="bf-mutation-result-title">
                Variant: {mutation.originalAminoAcid}
                {mutation.residue.residueNumber}
                {mutation.targetAminoAcid} (Chain {mutation.residue.chain})
              </h4>

              {mutation.heuristics && mutation.heuristics.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {mutation.heuristics.map((h) => (
                    <div
                      key={h.dimension}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        padding: "3px 6px",
                        borderRadius: "4px",
                        background: "#182622",
                      }}
                    >
                      <span style={{ textTransform: "capitalize", color: "#aab9b3" }}>{h.dimension}:</span>
                      <strong style={{ color: h.changed ? "#e0ba7b" : "#5ccfb5" }}>
                        {h.from} → {h.to} ({h.changed ? "altered" : "preserved"})
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: "12px", color: "#aab9b3" }}>
                <span>Neighboring residues within 5Å: </span>
                <strong style={{ color: "#fff" }}>{mutation.neighbors?.length ?? 0} residues</strong>
              </div>

              {mutation.neighbors && mutation.neighbors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {mutation.neighbors.map((n) => (
                    <span key={`${n.chain}:${n.residueNumber}`} className="bf-residue-chip">
                      {n.chain}:{n.residueNumber} ({n.distance.toFixed(1)}Å)
                    </span>
                  ))}
                </div>
              )}

              {mutation.disclaimer && (
                <p style={{ fontSize: "11px", color: "#879891", margin: 0, fontStyle: "italic" }}>
                  {mutation.disclaimer}
                </p>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "#aab9b3", padding: "10px", textAlign: "center" }}>
              Select an amino acid and click <em>Compute Mutation Impact</em> to calculate steric clashes and neighboring contacts.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
