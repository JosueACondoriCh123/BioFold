import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router";
import {
  Shield,
  ExternalLink,
  Copy,
  Layers3,
  Sparkles,
  LoaderCircle,
  FileQuestion,
  GitFork,
} from "lucide-react";
import { getSharedProject, type SharedProjectData } from "../services/sharingService";
import { commandBus } from "../core/commandBus";
import { viewerPort } from "../adapters/viewerPort";
import { BiologicalAnnotationsSection } from "../features/annotations/BiologicalAnnotationsSection";
import { StructureBookmarksSection } from "../features/bookmarks/StructureBookmarksSection";
import "./sharedProject.css";

export function SharedProjectPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [data, setData] = useState<SharedProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!shareToken) {
        setError("Missing share token");
        setLoading(false);
        return;
      }
      try {
        const res = await getSharedProject(shareToken);
        if (cancelled) return;
        if (!res) {
          setError("Shared project not found or public sharing has been revoked.");
        } else {
          setData(res);
        }
      } catch (err) {
        if (!cancelled) setError("Could not load shared project.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  // Mount 3D viewer when container and data are ready
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const pdbId = data.project.activePdbId || data.project.snapshot.structure?.pdbId || "1CRN";

    try {
      viewerPort.attach(containerRef.current);
      void commandBus.execute("load_structure", { pdbId }, { origin: "human" });
    } catch {
      /* ignore in environments without WebGL */
    }

    return () => {
      try {
        viewerPort.dispose();
      } catch {
        /* ignore */
      }
    };
  }, [data]);


  if (loading) {
    return (
      <div className="bf-shared-not-found">
        <LoaderCircle size={32} className="spin" style={{ color: "var(--bf-accent, #5ccfb5)" }} />
        <h3>Loading shared research workspace…</h3>
        <p style={{ color: "var(--bf-muted, #79918b)", fontSize: "13px" }}>
          Retrieving macromolecular snapshot and verified annotations
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bf-shared-not-found">
        <FileQuestion size={48} style={{ color: "#fc8181" }} />
        <h2>Shared Workspace Unavailable</h2>
        <p style={{ color: "var(--bf-muted, #79918b)", maxWidth: "420px", fontSize: "13px" }}>
          {error ?? "This shared link does not exist, has expired, or the owner has disabled public sharing."}
        </p>
        <Link to="/" className="bf-fork-btn" style={{ marginTop: "12px" }}>
          Return to BioFold 3D
        </Link>
      </div>
    );
  }

  const activePdb = data.project.activePdbId || data.project.snapshot.structure?.pdbId || "1CRN";

  const handleFlyToResidue = (chain: string, residueNumber: number) => {
    void commandBus.execute(
      "focus_residues",
      { residues: [{ chain, residueNumber }], label: true },
      { origin: "human" },
    );
  };

  return (
    <div className="bf-shared-page-container">
      {/* Top Header */}
      <header className="bf-shared-topbar">
        <div className="bf-shared-brand-col">
          <Link to="/" className="brand" aria-label="BioFold 3D">
            <div className="brand-mark">
              <img
                src="/logo.png"
                alt=""
                aria-hidden="true"
                className="brand-mark-img"
                width="38"
                height="38"
              />
            </div>
            <strong>
              BioFold <em>3D</em>
            </strong>
          </Link>
          <span className="bf-shared-readonly-badge">
            <Shield size={12} /> Read-Only View
          </span>
        </div>

        <div className="bf-shared-title-col">
          <strong>{data.project.title}</strong>
          <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>
            (Structure: {activePdb})
          </span>
        </div>

        <div className="bf-shared-actions">
          <Link to="/app" className="bf-fork-btn" title="Open and fork into your private laboratory">
            <GitFork size={14} />
            <span>Open in BioFold</span>
          </Link>
        </div>
      </header>

      {/* Main 3D & Side layout */}
      <main className="bf-shared-main-layout">
        <div className="bf-shared-viewer-pane" ref={containerRef} id="shared-viewer-container" />

        <aside className="bf-shared-sidebar" aria-label="Shared project annotations">
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--bf-muted, #79918b)", letterSpacing: "0.05em" }}>
              Project Summary
            </span>
            <p style={{ fontSize: "12px", color: "var(--bf-text, #e8eeea)", margin: "4px 0 0" }}>
              {data.project.description || "No description provided for this shared workspace."}
            </p>
          </div>

          {/* Biological Annotations */}
          <BiologicalAnnotationsSection
            pdbId={activePdb}
            onHighlightResidues={(residues) => {
              void commandBus.execute("focus_residues", { residues, label: true }, { origin: "human" });
            }}
          />

          {/* Author's 3D Bookmarks */}
          <StructureBookmarksSection
            pdbId={activePdb}
            projectId={data.project.id}
            onFlyToResidue={handleFlyToResidue}
          />
        </aside>
      </main>
    </div>
  );
}

export default SharedProjectPage;

