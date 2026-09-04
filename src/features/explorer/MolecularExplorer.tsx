import { useState, useMemo, useRef } from "react";
import {
  Atom,
  Dna,
  ExternalLink,
  Eye,
  Filter,
  Microscope,
  Search,
  Sparkles,
  Zap,
  Plus,
  Upload,
  FileText,
  X,
  AlertCircle,
} from "lucide-react";
import {
  CATALOG_CATEGORIES,
  getAllCatalogItems,
  saveCustomCatalogItem,
  filterCatalog,
  type MolecularCategory,
  type MolecularCatalogItem,
} from "../../data/molecularCatalog";
import { setCachedStructure } from "../../adapters/structureCache";
import { detectStructureFormat } from "../../adapters/structureGateway";
import { uploadStructureFile } from "../../services/molecularStorageService";
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
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Import Dialog State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"pdb_id" | "file">("pdb_id");
  const [importPdbId, setImportPdbId] = useState("");
  const [importName, setImportName] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [importFile, setImportFile] = useState<{
    name: string;
    content: string;
    format: "cif" | "pdb";
    size: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [isDraggingImport, setIsDraggingImport] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const allMolecules = useMemo(() => getAllCatalogItems(), [catalogVersion]);

  const filteredMolecules = useMemo(() => {
    let list = filterCatalog({ category: selectedCategory, query: searchQuery });
    if (highResOnly) {
      list = list.filter((item) => item.resolution <= 2.0);
    }
    return list;
  }, [selectedCategory, searchQuery, highResOnly, catalogVersion]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allMolecules.length };
    for (const cat of CATALOG_CATEGORIES) {
      counts[cat.id] = allMolecules.filter((m) => m.category === cat.id).length;
    }
    return counts;
  }, [allMolecules]);

  const currentMolecule = useMemo(
    () => allMolecules.find((m) => m.id === currentPdbId.toUpperCase()),
    [allMolecules, currentPdbId],
  );

  function handleImportFileSelected(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setImportError("File exceeds the 10 MiB safety limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      if (!text.includes("ATOM") && !text.includes("data_") && !text.includes("_atom_site")) {
        setImportError("The file does not appear to contain valid molecular structure records.");
        return;
      }
      const format = detectStructureFormat(text);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const alnumOnly = cleanName.replace(/[^a-zA-Z0-9]/g, "");
      let derivedId = "UPL1";
      if (alnumOnly.length === 4) {
        derivedId = alnumOnly.toUpperCase();
      } else if (alnumOnly.length > 4) {
        derivedId = alnumOnly.slice(0, 4).toUpperCase();
      }
      setImportPdbId(derivedId);
      if (!importName.trim()) {
        setImportName(cleanName);
      }
      setImportFile({
        name: file.name,
        content: text,
        format,
        size: file.size,
      });
      setImportError(null);
    };
    reader.onerror = () => {
      setImportError("Failed to read the selected file.");
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport() {
    const normalized = importPdbId.trim().toUpperCase();
    if (!normalized || !(/^[A-Z0-9]{4}$/.test(normalized) || /^AF-[A-Z0-9_-]+$/.test(normalized) || /^[A-Z0-9]{6,10}$/.test(normalized))) {
      setImportError("Use a 4-character PDB ID (e.g. 1CRN) or AlphaFold/UniProt identifier (e.g. AF-P04637-F1 or P04637).");
      return;
    }

    setIsSavingImport(true);
    setImportError(null);

    try {
      if (importMode === "file") {
        if (!importFile) {
          setImportError("Please choose or drop a PDB/CIF file.");
          setIsSavingImport(false);
          return;
        }
        await uploadStructureFile({
          pdbId: normalized,
          content: importFile.content,
          format: importFile.format,
          filename: importFile.name,
        });
        saveCustomCatalogItem({
          id: normalized,
          name: importName.trim() || importFile.name,
          category: "custom",
          organism: "User Upload",
          resolution: 0,
          method: "Synthetic",
          description: importDesc.trim() || `Uploaded structure from ${importFile.name}.`,
        });
      } else {
        saveCustomCatalogItem({
          id: normalized,
          name: importName.trim() || `PDB ${normalized}`,
          category: "custom",
          organism: "RCSB Archive",
          resolution: 0,
          method: "X-ray",
          description: importDesc.trim() || `Imported structure from PDB ${normalized}.`,
        });
      }

      setCatalogVersion((v) => v + 1);
      setSelectedCategory("custom");
      setIsImportOpen(false);
      setImportPdbId("");
      setImportName("");
      setImportDesc("");
      setImportFile(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import structure.");
    } finally {
      setIsSavingImport(false);
    }
  }

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
                  className="bf-explorer-search-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              className="bf-import-structure-btn"
              onClick={() => {
                setIsImportOpen(true);
                setImportError(null);
              }}
              aria-label="Import or upload structure"
            >
              <Plus size={15} />
              <span>Import PDB / File</span>
            </button>

            <span className="bf-explorer-count-badge">
              Showing {filteredMolecules.length} of {allMolecules.length} molecules
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

      {/* Explorer Import Modal */}
      {isImportOpen && (
        <div
          className="bf-explorer-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingImport) setIsImportOpen(false);
          }}
        >
          <div className="bf-explorer-modal-dialog" role="dialog" aria-labelledby="import-modal-title">
            <header className="bf-explorer-modal-header">
              <h3 id="import-modal-title">Import Molecular Structure</h3>
              <button
                type="button"
                className="bf-modal-close-btn"
                onClick={() => setIsImportOpen(false)}
                disabled={isSavingImport}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </header>

            <div className="bf-explorer-modal-body">
              {importError && (
                <div className="bf-modal-error" role="alert" style={{ marginBottom: 16 }}>
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}

              <div className="bf-dialog-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  className={`bf-dialog-tab ${importMode === "pdb_id" ? "is-active" : ""}`}
                  onClick={() => { setImportMode("pdb_id"); setImportError(null); }}
                  aria-selected={importMode === "pdb_id"}
                >
                  RCSB PDB Archive ID
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`bf-dialog-tab ${importMode === "file" ? "is-active" : ""}`}
                  onClick={() => { setImportMode("file"); setImportError(null); }}
                  aria-selected={importMode === "file"}
                >
                  Upload File (.pdb / .cif)
                </button>
              </div>

              {importMode === "pdb_id" ? (
                <div className="bf-form-group">
                  <label htmlFor="import-pdb-id">PDB ID Code</label>
                  <input
                    id="import-pdb-id"
                    type="text"
                    value={importPdbId}
                    onChange={(e) => setImportPdbId(e.target.value.toUpperCase())}
                    placeholder="e.g. 7C22, P04637, AF-P04637-F1"
                    maxLength={32}
                    disabled={isSavingImport}
                  />
                  <span className="bf-form-hint">
                    Fetches experimental structures from RCSB PDB or AI predictions from AlphaFold DB.
                  </span>
                </div>
              ) : (
                <div className="bf-form-group">
                  <label>Local Molecular File</label>
                  <div
                    className={`bf-file-dropzone ${isDraggingImport ? "is-dragover" : ""} ${importFile ? "has-file" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingImport(true); }}
                    onDragLeave={() => setIsDraggingImport(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingImport(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleImportFileSelected(file);
                    }}
                    onClick={() => {
                      if (!importFile) importFileInputRef.current?.click();
                    }}
                  >
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".pdb,.cif,.ent,.txt"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportFileSelected(file);
                      }}
                    />
                    {!importFile ? (
                      <div className="bf-dropzone-prompt">
                        <Upload size={24} className="bf-dropzone-icon" />
                        <span className="bf-dropzone-text">
                          <strong>Choose a PDB/CIF file</strong> or drop here
                        </span>
                        <span className="bf-dropzone-sub">Supports .pdb, .cif, .ent up to 10 MiB</span>
                      </div>
                    ) : (
                      <div className="bf-uploaded-file-card">
                        <div className="bf-uploaded-file-info">
                          <FileText size={20} className="bf-file-icon" />
                          <div>
                            <strong className="bf-file-name">{importFile.name}</strong>
                            <span className="bf-file-meta">
                              {importFile.format.toUpperCase()} · {(importFile.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="bf-file-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImportFile(null);
                            if (importFileInputRef.current) importFileInputRef.current.value = "";
                          }}
                          aria-label="Remove file"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label htmlFor="import-file-pdb-id" style={{ fontSize: 12, marginBottom: 4 }}>
                      Assigned 4-character Code <span className="bf-required">*</span>
                    </label>
                    <input
                      id="import-file-pdb-id"
                      type="text"
                      value={importPdbId}
                      maxLength={4}
                      onChange={(e) => setImportPdbId(e.target.value.toUpperCase())}
                      placeholder="e.g. UPL1"
                      disabled={isSavingImport}
                    />
                  </div>
                </div>
              )}

              <div className="bf-form-group">
                <label htmlFor="import-name">Molecule Name (optional)</label>
                <input
                  id="import-name"
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="e.g., SARS-CoV-2 Main Protease"
                  maxLength={120}
                  disabled={isSavingImport}
                />
              </div>

              <div className="bf-form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="import-desc">Description (optional)</label>
                <textarea
                  id="import-desc"
                  value={importDesc}
                  onChange={(e) => setImportDesc(e.target.value)}
                  placeholder="Notes about biological function, resolution, or origin…"
                  rows={2}
                  maxLength={400}
                  disabled={isSavingImport}
                />
              </div>
            </div>

            <footer className="bf-explorer-modal-footer">
              <button
                type="button"
                className="bf-button bf-button-ghost"
                onClick={() => setIsImportOpen(false)}
                disabled={isSavingImport}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bf-button bf-modal-submit-btn"
                onClick={handleConfirmImport}
                disabled={isSavingImport}
              >
                {isSavingImport ? "Importing…" : "Add to Catalog"}
              </button>
            </footer>
          </div>
        </div>
      )}
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
