import { useState, useEffect } from "react";
import { Bookmark, Plus, MapPin, Trash2, Camera, Sparkles, LoaderCircle } from "lucide-react";
import { listBookmarks, createBookmark, deleteBookmark } from "../../services/bookmarkService";
import type { BookmarkAnnotation } from "../../types/domain";
import "./bookmarks.css";

const PRESET_COLORS = [
  { label: "Emerald", hex: "#5ccfb5" },
  { label: "Amber", hex: "#f6ad55" },
  { label: "Cyan", hex: "#63b3ed" },
  { label: "Coral", hex: "#fc8181" },
  { label: "Purple", hex: "#b794f4" },
];

export interface StructureBookmarksSectionProps {
  pdbId: string;
  projectId?: string;
  selectedResidue?: { chain: string; residueNumber: number } | null;
  onFlyToResidue: (chain: string, residueNumber: number, color?: string) => void;
}

export function StructureBookmarksSection({
  pdbId,
  projectId,
  selectedResidue,
  onFlyToResidue,
}: StructureBookmarksSectionProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [chain, setChain] = useState("A");
  const [residueNumber, setResidueNumber] = useState(1);
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].hex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load bookmarks on mount or pdbId change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pdbId) return;
      setLoading(true);
      try {
        const list = await listBookmarks(pdbId, projectId);
        if (!cancelled) setBookmarks(list);
      } catch (err) {
        console.warn("Failed to load bookmarks:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pdbId, projectId]);

  // Sync chain & residue with selectedResidue if form is open or on select
  useEffect(() => {
    if (selectedResidue) {
      setChain(selectedResidue.chain || "A");
      setResidueNumber(selectedResidue.residueNumber || 1);
    }
  }, [selectedResidue]);

  const handleOpenForm = () => {
    if (selectedResidue) {
      setChain(selectedResidue.chain || "A");
      setResidueNumber(selectedResidue.residueNumber || 1);
    }
    setIsFormOpen(true);
  };

  const handleCreate = async () => {
    if (!note.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createBookmark({
        pdbId,
        projectId,
        chain: chain.trim().toUpperCase() || "A",
        residueNumber: Number(residueNumber) || 1,
        note: note.trim(),
        color: selectedColor,
      });

      setBookmarks((prev) => [created, ...prev.filter((b) => b.id !== created.id)]);
      setNote("");
      setIsFormOpen(false);
    } catch (err) {
      console.warn("Failed to create bookmark:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    await deleteBookmark(id, pdbId);
  };

  return (
    <section className="bf-bookmarks-section" aria-labelledby="bookmarks-section-title">
      <header className="bf-bookmarks-header">
        <div className="bf-bookmarks-title">
          <Bookmark size={15} aria-hidden="true" />
          <h4 id="bookmarks-section-title">3D Notes & Bookmarks</h4>
          {bookmarks.length > 0 && (
            <span className="bf-annotation-count-pill">{bookmarks.length}</span>
          )}
        </div>

        {!isFormOpen && (
          <button
            type="button"
            className="bf-add-bookmark-btn"
            onClick={handleOpenForm}
            title="Add a scientific pin or note to a 3D coordinate"
          >
            <Plus size={13} />
            <span>Pin Note</span>
          </button>
        )}
      </header>

      {/* Creation Form */}
      {isFormOpen && (
        <div className="bf-bookmark-form-card" role="form" aria-label="Add 3D Bookmark">
          <div className="bf-bookmark-form-row">
            <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>Target:</span>
            <div className="bf-bookmark-target-badge">
              <label htmlFor="bm-chain" className="sr-only">Chain</label>
              <input
                id="bm-chain"
                style={{ width: "24px", background: "transparent", border: "none", color: "#fff", fontWeight: 700, outline: "none" }}
                value={chain}
                maxLength={2}
                onChange={(e) => setChain(e.target.value.toUpperCase())}
              />
              <span>:</span>
              <label htmlFor="bm-res" className="sr-only">Residue Number</label>
              <input
                id="bm-res"
                type="number"
                style={{ width: "42px", background: "transparent", border: "none", color: "#fff", outline: "none" }}
                value={residueNumber}
                onChange={(e) => setResidueNumber(Number(e.target.value))}
              />
            </div>

            {/* Color chips */}
            <div className="bf-color-chips-row">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={c.label}
                  className={`bf-color-chip ${selectedColor === c.hex ? "is-selected" : ""}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setSelectedColor(c.hex)}
                />
              ))}
            </div>
          </div>

          <textarea
            className="bf-bookmark-note-input"
            placeholder="Write a scientific finding, binding observation, or hypothesis…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />

          <div className="bf-bookmark-form-actions">
            <button
              type="button"
              className="bf-btn-secondary"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bf-btn-primary"
              onClick={handleCreate}
              disabled={isSubmitting || !note.trim()}
            >
              {isSubmitting ? "Saving…" : "Save Bookmark"}
            </button>
          </div>
        </div>
      )}

      {/* Bookmarks List */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--bf-muted, #79918b)", padding: "8px 0" }}>
          <LoaderCircle size={13} className="spin" />
          <span>Loading persistent annotations…</span>
        </div>
      ) : bookmarks.length === 0 && !isFormOpen ? (
        <div className="bf-bookmark-empty">
          <MapPin size={20} style={{ opacity: 0.5, marginBottom: "6px" }} />
          <span>No 3D bookmarks saved yet.</span>
          <span style={{ fontSize: "10px", opacity: 0.7, marginTop: "2px" }}>
            Select a residue in 3D and click Pin Note to remember key active sites or binding pockets.
          </span>
        </div>
      ) : (
        <div className="bf-bookmarks-list" role="list">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="bf-bookmark-card"
              style={{ borderLeftColor: bm.color || "#5ccfb5" }}
              role="listitem"
            >
              <div className="bf-bookmark-card-top">
                <div className="bf-bookmark-res-tag">
                  <MapPin size={12} style={{ color: bm.color || "#5ccfb5" }} />
                  <span>
                    {bm.chain}:{bm.residueNumber}
                  </span>
                </div>

                <div className="bf-bookmark-card-actions">
                  <button
                    type="button"
                    className="bf-fly-btn"
                    onClick={() => onFlyToResidue(bm.chain, bm.residueNumber, bm.color)}
                    title="Fly camera to this coordinate in 3D"
                  >
                    <Camera size={11} />
                    <span>Fly 3D</span>
                  </button>

                  <button
                    type="button"
                    className="bf-del-btn"
                    onClick={() => handleDelete(bm.id)}
                    title="Delete bookmark"
                    aria-label={`Delete bookmark for ${bm.chain}:${bm.residueNumber}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="bf-bookmark-note-text">{bm.note}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
