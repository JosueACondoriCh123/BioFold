import { useState, useMemo } from "react";
import { Atom, Dna, ExternalLink, Eye, Filter, Microscope, Search, Sparkles, Zap } from "lucide-react";
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
  const [highResOnly, setHighResOnly] = useState(false);

  const filteredMolecules = useMemo(() => {
    let list = filterCatalog({ category: selectedCategory, query: searchQuery });
    if (highResOnly) {
      list = list.filter((item) => item.resolution <= 2.0);
    }
    return list;
  }, [selectedCategory, searchQuery, highResOnly]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: MOLECULAR_CATALOG.length };
    for (const cat of CATALOG_CATEGORIES) {
      counts[cat.id] = MOLECULAR_CATALOG.filter((m) => m.category === cat.id).length;
    }
    return counts;
  }, []);

  const currentMolecule = useMemo(
    () => MOLECULAR_CATALOG.find((m) => m.id === currentPdbId.toUpperCase()),
    [currentPdbId],
  );

  return (
    <div className="bf-explorer-container lab-screen-layout" role="region" aria-label="Molecular Explorer">
      {/* Left Sidebar: Specialized Catalog Navigation & Filters */}
      <aside className="bf-explorer-sidebar panel" aria-label="Catalog Filters">
        <div className="panel-title">
          <div className="panel-title-icon">
            <Microscope size={18} />
          </div>
          <div>
            <span>CATALOG ARCHIVE</span>
            <h2>Molecular Explorer</h2>
          </div>
        </div>

        {/* Section 1: Catalog Statistics */}
        <section className="control-section">
          <div className="section-label">
            <span>Archive Stats</span>
            <small>Live</small>
          </div>
          <div className="bf-sidebar-stats-grid">
            <div className="bf-stat-box">
              <strong>62</strong>
              <span>Structures</span>
            </div>
            <div className="bf-stat-box">
              <strong>6</strong>
              <span>Families</span>
            </div>
            <div className="bf-stat-box">
              <strong>100%</strong>
              <span>mmCIF</span>
            </div>
          </div>
        </section>

        {/* Section 2: Biological Classes */}
        <section className="control-section">
          <div className="section-label">
            <span>Biological Classes</span>
            <small>Taxonomy</small>
          </div>
          <div className="bf-category-nav-list" role="tablist" aria-label="Category filter">
            <button
              type="button"
              className={`bf-cat-nav-btn ${selectedCategory === "all" ? "is-active" : ""}`}
              onClick={() => setSelectedCategory("all")}
              role="tab"
              aria-selected={selectedCategory === "all"}
            >
              <div className="bf-cat-label-row">
                <span className="bf-cat-nav-dot" style={{ backgroundColor: "#5ccfb5" }} />
                <span>All Molecules</span>
              </div>
              <span className="bf-cat-nav-count">{categoryCounts.all}</span>
            </button>

            {CATALOG_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`bf-cat-nav-btn ${selectedCategory === cat.id ? "is-active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
                role="tab"
                aria-selected={selectedCategory === cat.id}
              >
                <div className="bf-cat-label-row">
                  <span className="bf-cat-nav-dot" style={{ backgroundColor: cat.color }} />
                  <span>{cat.label}</span>
                </div>
                <span className="bf-cat-nav-count">{categoryCounts[cat.id]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Section 3: Resolution Criteria */}
        <section className="control-section">
          <div className="section-label">
            <span>Resolution Filter</span>
            <small>Cryo/X-Ray</small>
          </div>
          <div className="segmented-grid">
            <button
              type="button"
              className={!highResOnly ? "active" : ""}
              onClick={() => setHighResOnly(false)}
            >
              All Res
            </button>
            <button
              type="button"
              className={highResOnly ? "active" : ""}
              onClick={() => setHighResOnly(true)}
              title="Filter molecules with resolution <= 2.0 Å"
            >
              ≤ 2.0 Å
            </button>
          </div>
        </section>

        {/* Section 4: Current Scene Context */}
        <section className="control-section">
          <div className="section-label">
            <span>Active Scene Target</span>
            <small>3D View</small>
          </div>
          <div className="bf-current-target-card">
            <div className="bf-target-id">{currentPdbId.toUpperCase()}</div>
            <div className="bf-target-name">Loaded Workspace Target</div>
            <button
              type="button"
              className="bf-return-studio-btn"
              onClick={() => onSelectMolecule(currentPdbId, "studio")}
            >
              <Eye size={14} />
              <span>Inspect in 3D Studio</span>
            </button>
          </div>
        </section>
      </aside>

      {/* Right Main Stage: Search, Controls, and Molecule Showcase Grid */}
      <main className="bf-explorer-main panel" aria-label="Catalog Grid">
        <header className="bf-explorer-main-header">
          <div className="bf-explorer-search-row">
            <div className="bf-explorer-search-input-wrapper">
              <Search size={16} className="bf-explorer-search-icon" />
              <input
                type="text"
                className="bf-explorer-search-input"
                placeholder="Search 62 structures by PDB ID (e.g. 6LU7, 1CRN), name, organism, or UniProt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search molecules"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="bf-search-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <span className="bf-explorer-count-badge">
              Showing {filteredMolecules.length} of {MOLECULAR_CATALOG.length} molecules
            </span>
          </div>
        </header>

        <div className="bf-explorer-grid">
          {filteredMolecules.length === 0 ? (
            <div className="bf-explorer-empty">
              <Atom size={44} color="#5ccfb5" />
              <h3>No matching biomolecules found</h3>
              <p>Try searching for a different keyword or resetting your category filter.</p>
              <button
                type="button"
                className="bf-reset-filters-btn"
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                  setHighResOnly(false);
                }}
              >
                Reset all filters
              </button>
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
      </main>
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
          <span>Workbench</span>
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
