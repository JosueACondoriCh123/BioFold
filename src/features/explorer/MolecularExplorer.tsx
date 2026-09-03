import { useState, useMemo } from "react";
import { Atom, Dna, ExternalLink, Microscope, Search, Sparkles } from "lucide-react";
import {
  CATALOG_CATEGORIES,
  MOLECULAR_CATALOG,
  filterCatalog,
  type MolecularCategory,
  type MolecularCatalogItem,
} from "../../data/molecularCatalog";
import "./explorer.css";

export interface MolecularExplorerProps {
  currentPdbId: string;
  onSelectMolecule: (id: string, targetScreen?: "studio" | "workbench" | "copilot") => void;
}

export function MolecularExplorer({
  currentPdbId,
  onSelectMolecule,
}: MolecularExplorerProps) {
  const [selectedCategory, setSelectedCategory] = useState<MolecularCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMolecules = useMemo(() => {
    return filterCatalog({ category: selectedCategory, query: searchQuery });
  }, [selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: MOLECULAR_CATALOG.length };
    for (const cat of CATALOG_CATEGORIES) {
      counts[cat.id] = MOLECULAR_CATALOG.filter((m) => m.category === cat.id).length;
    }
    return counts;
  }, []);

  return (
    <div className="bf-explorer-container" role="region" aria-label="Molecular Explorer">
      <header className="bf-explorer-header">
        <div className="bf-explorer-title-row">
          <h2>
            <Microscope size={22} color="#5CCFB5" />
            Molecular Explorer
          </h2>
          <span className="bf-explorer-count-badge">
            Showing {filteredMolecules.length} of {MOLECULAR_CATALOG.length} molecules
          </span>
        </div>
        <p className="bf-explorer-subtitle">
          High-performance structural catalog covering enzymes, viral proteins, oncogenic drivers, membrane receptors, antibodies, and nucleic acid complexes.
        </p>
      </header>

      <div className="bf-explorer-controls-bar">
        <div className="bf-explorer-search-row">
          <div className="bf-explorer-search-input-wrapper">
            <Search size={16} className="bf-explorer-search-icon" />
            <input
              type="text"
              className="bf-explorer-search-input"
              placeholder="Search by PDB ID (e.g. 6LU7), protein name, organism, or UniProt ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search molecules"
            />
          </div>
        </div>

        <div className="bf-explorer-category-pills" role="tablist" aria-label="Category filter">
          <button
            type="button"
            className={`bf-category-pill ${selectedCategory === "all" ? "is-active" : ""}`}
            onClick={() => setSelectedCategory("all")}
            role="tab"
            aria-selected={selectedCategory === "all"}
          >
            <span>All</span>
            <span className="bf-category-count">{categoryCounts.all}</span>
          </button>
          {CATALOG_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`bf-category-pill ${selectedCategory === cat.id ? "is-active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
              role="tab"
              aria-selected={selectedCategory === cat.id}
            >
              <span className="bf-category-dot" style={{ backgroundColor: cat.color }} />
              <span>{cat.label}</span>
              <span className="bf-category-count">{categoryCounts[cat.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bf-explorer-grid">
        {filteredMolecules.length === 0 ? (
          <div className="bf-explorer-empty">
            <Atom size={40} color="#aab9b3" />
            <h3>No matching biomolecules found</h3>
            <p>Try searching for a different term or selecting another category.</p>
          </div>
        ) : (
          filteredMolecules.map((item) => (
            <MolecularCard
              key={item.id}
              item={item}
              isCurrent={currentPdbId.toUpperCase() === item.id}
              onSelect={onSelectMolecule}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MolecularCard({
  item,
  isCurrent,
  onSelect,
}: {
  item: MolecularCatalogItem;
  isCurrent: boolean;
  onSelect: (id: string, targetScreen?: "studio" | "workbench" | "copilot") => void;
}) {
  return (
    <article className={`bf-mol-card ${isCurrent ? "is-current" : ""}`} data-pdb-id={item.id}>
      <div className="bf-mol-card-top">
        <span className="bf-mol-id-badge">{item.id}</span>
        <div className="bf-mol-card-meta-tags">
          <span className="bf-meta-tag">{item.resolution.toFixed(2)} Å</span>
          <span className="bf-meta-tag">{item.method}</span>
          {isCurrent && <span className="bf-current-badge">Active</span>}
        </div>
      </div>

      <h3 className="bf-mol-card-name">{item.name}</h3>
      <div className="bf-mol-card-organism">{item.organism}</div>
      <p className="bf-mol-card-desc">{item.description}</p>

      {item.keyResidues && item.keyResidues.length > 0 && (
        <div className="bf-mol-card-residues">
          <span>Active sites:</span>
          {item.keyResidues.map((res) => (
            <span key={res} className="bf-residue-chip">
              {res}
            </span>
          ))}
        </div>
      )}

      <div className="bf-mol-card-actions">
        <button
          type="button"
          className="bf-mol-action-btn-primary"
          onClick={() => onSelect(item.id, "studio")}
          title={`Load ${item.id} into 3D Studio`}
        >
          <Sparkles size={14} />
          <span>Inspect 3D</span>
        </button>

        <button
          type="button"
          className="bf-mol-action-btn-secondary"
          onClick={() => onSelect(item.id, "workbench")}
          title={`Analyze sequence & mutations of ${item.id}`}
        >
          <Dna size={13} />
        </button>

        <a
          href={`https://www.rcsb.org/structure/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bf-mol-action-btn-secondary"
          title="Open in wwPDB archive (RCSB)"
          aria-label={`Open ${item.id} on RCSB wwPDB`}
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}
