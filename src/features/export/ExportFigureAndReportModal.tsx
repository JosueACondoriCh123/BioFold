import { useState, useEffect, useCallback } from "react";
import {
  Download,
  FileText,
  Camera,
  X,
  Copy,
  Check,
  Printer,
  Sparkles,
  Layers,
  HelpCircle,
  FileDown,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { viewerPort } from "../../adapters/viewerPort";
import {
  capturePublicationFigure,
  downloadBlobOrDataUrl,
  copyDataUrlToClipboard,
  type FigureExportOptions,
} from "../../services/figureExportService";
import {
  generateMarkdownReport,
  openPrintableReportWindow,
  type ScientificReportCompilation,
  type StructureReportData,
  type MeasurementReportItem,
  type MutationReportItem,
  type AnnotationReportItem,
} from "../../services/scientificReportService";
import { listBookmarks } from "../../services/bookmarkService";
import { getBiologicalAnnotations } from "../../services/uniprotAnnotationService";
import type { DistanceMeasurement, MutationPreview, ActivityEntry, StructureSummary } from "../../types/domain";
import "./exportModal.css";

export interface ExportFigureAndReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdbId: string;
  structureName?: string;
  summary?: StructureSummary;
  currentRepresentation: string;
  currentColorScheme: string;
  activeMeasurement?: DistanceMeasurement;
  activeMutation?: MutationPreview;
  activityEntries: ActivityEntry[];
  projectId?: string;
  projectTitle?: string;
  copilotSummary?: string;
}

export function ExportFigureAndReportModal({
  isOpen,
  onClose,
  pdbId,
  structureName,
  summary,
  currentRepresentation,
  currentColorScheme,
  activeMeasurement,
  activeMutation,
  activityEntries,
  projectId,
  projectTitle,
  copilotSummary,
}: ExportFigureAndReportModalProps) {
  const [activeTab, setActiveTab] = useState<"figure" | "report">("figure");

  // Figure State
  const [resolution, setResolution] = useState<"1x" | "2x" | "4k">("4k");
  const [background, setBackground] = useState<"white" | "transparent" | "dark">("white");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // Report State
  const [reportTitle, setReportTitle] = useState(`Structural Analysis Report: ${pdbId}`);
  const [sections, setSections] = useState({
    summary: true,
    figure: true,
    measurements: true,
    mutations: true,
    annotations: true,
    copilot: true,
  });
  const [compiledReport, setCompiledReport] = useState<ScientificReportCompilation | null>(null);

  // Refresh preview snapshot
  const updateSnapshot = useCallback(async () => {
    if (!isOpen) return;
    setIsCapturing(true);
    try {
      const uri = await capturePublicationFigure(viewerPort, {
        resolution,
        background,
        format,
        quality: 0.95,
        dpi: 300,
      });
      setPreviewUrl(uri);
    } catch {
      /* ignore */
    } finally {
      setIsCapturing(false);
    }
  }, [isOpen, resolution, background, format]);

  useEffect(() => {
    if (isOpen) {
      void updateSnapshot();
    }
  }, [isOpen, resolution, background, format, updateSnapshot]);

  // Compile report data when opening or switching tabs
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function prepareReport() {
      const measurements: MeasurementReportItem[] = [];
      if (activeMeasurement) {
        measurements.push({
          from: `${activeMeasurement.from.chain}:${activeMeasurement.from.residueNumber}:${activeMeasurement.from.atomName}`,
          to: `${activeMeasurement.to.chain}:${activeMeasurement.to.residueNumber}:${activeMeasurement.to.atomName}`,
          angstroms: activeMeasurement.angstroms,
        });
      }

      const mutations: MutationReportItem[] = [];
      if (activeMutation) {
        mutations.push({
          residue: `${activeMutation.residue.chain}:${activeMutation.residue.residueNumber}`,
          original: activeMutation.originalAminoAcid,
          target: activeMutation.targetAminoAcid,
          neighborCount: activeMutation.neighbors?.length ?? 0,
          heuristics: activeMutation.heuristics?.map((h) => ({
            dimension: h.dimension,
            note: h.note,
          })) ?? [],
        });
      }

      const annotations: AnnotationReportItem[] = [];

      // Fetch biological annotations & bookmarks
      try {
        const [bioAnn, bookmarks] = await Promise.all([
          getBiologicalAnnotations(pdbId).catch(() => null),
          listBookmarks(pdbId, projectId).catch(() => []),
        ]);

        if (!cancelled && bioAnn) {
          bioAnn.activeSites?.forEach((cat) => {
            annotations.push({
              type: "catalytic",
              label: `${cat.chain}:${cat.residueNumber} (${cat.aminoAcid ?? "Active Site"})`,
              detail: cat.description,
            });
          });
          bioAnn.variants?.slice(0, 5).forEach((v) => {
            annotations.push({
              type: "variant",
              label: `${v.chain}:${v.position} (${v.wildType}->${v.mutant})`,
              detail: `${v.clinicalSignificance ?? "Variant"} · ${v.consequence ?? "Reported mutation"}`,
            });
          });
        }

        if (!cancelled && bookmarks.length > 0) {
          bookmarks.forEach((bm) => {
            annotations.push({
              type: "bookmark",
              label: `${bm.chain}:${bm.residueNumber}`,
              detail: bm.note,
            });
          });
        }
      } catch {
        /* fallback */
      }

      if (cancelled) return;

      const structData: StructureReportData = {
        pdbId,
        name: structureName,
        chainCount: summary?.chainCount,
        residueCount: summary?.residueCount,
        atomCount: summary?.atomCount,
        ligandCount: summary?.ligandCount,
      };

      setCompiledReport({
        title: reportTitle,
        projectTitle,
        date: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        structure: structData,
        viewStyle: {
          representation: currentRepresentation,
          colorScheme: currentColorScheme,
        },
        figureDataUrl: previewUrl,
        measurements,
        mutations,
        annotations,
        copilotSummary: copilotSummary || "Structural examination conducted via BioFold 3D platform.",
        includedSections: sections,
      });
    }

    void prepareReport();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    pdbId,
    structureName,
    summary,
    currentRepresentation,
    currentColorScheme,
    activeMeasurement,
    activeMutation,
    projectId,
    projectTitle,
    copilotSummary,
    reportTitle,
    previewUrl,
    sections,
  ]);

  if (!isOpen) return null;

  const handleDownloadFigure = () => {
    if (!previewUrl) return;
    const ext = format === "jpeg" ? "jpg" : "png";
    const filename = `${pdbId}_${resolution}_${background}.${ext}`;
    downloadBlobOrDataUrl(previewUrl, filename);
  };

  const handleCopyClipboard = async () => {
    if (!previewUrl) return;
    const ok = await copyDataUrlToClipboard(previewUrl);
    if (ok) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!compiledReport) return;
    const markdown = generateMarkdownReport({
      ...compiledReport,
      figureDataUrl: sections.figure ? previewUrl : null,
      includedSections: sections,
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    downloadBlobOrDataUrl(blob, `${pdbId}_scientific_report.md`);
  };

  const handlePrintPdf = () => {
    if (!compiledReport) return;
    openPrintableReportWindow({
      ...compiledReport,
      figureDataUrl: sections.figure ? previewUrl : null,
      includedSections: sections,
    });
  };

  return (
    <div
      className="bf-export-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="bf-export-modal-card">
        {/* Modal Header */}
        <header className="bf-export-header">
          <div className="bf-export-title">
            <Download size={18} />
            <span id="export-modal-title">Export Figure & Scientific Report</span>
          </div>
          <button
            type="button"
            className="bf-export-close-btn"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            <X size={16} />
          </button>
        </header>

        {/* Tab Switcher */}
        <nav className="bf-export-tabs" role="tablist">
          <button
            type="button"
            className={`bf-export-tab-btn ${activeTab === "figure" ? "is-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "figure"}
            onClick={() => setActiveTab("figure")}
          >
            <Camera size={14} />
            <span>Publication Figure (4K / 300 DPI)</span>
          </button>
          <button
            type="button"
            className={`bf-export-tab-btn ${activeTab === "report" ? "is-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "report"}
            onClick={() => setActiveTab("report")}
          >
            <FileText size={14} />
            <span>Scientific Report (PDF / Markdown)</span>
          </button>
        </nav>

        {/* Modal Content */}
        <div className="bf-export-body">
          {activeTab === "figure" && (
            <>
              {/* Image Preview Box */}
              <div className={`bf-export-preview-box bg-${background}`}>
                {isCapturing ? (
                  <LoaderCircle size={28} className="spin" style={{ color: "var(--bf-accent, #5ccfb5)" }} />
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={`Preview of ${pdbId}`}
                    className="bf-export-preview-img"
                  />
                ) : (
                  <span style={{ color: "#79918b", fontSize: "12px" }}>Generating preview…</span>
                )}
              </div>

              {/* Controls Grid */}
              <div className="bf-export-config-grid">
                {/* Resolution */}
                <div className="bf-export-option-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label>Resolution</label>
                    <span className="bf-dpi-badge">
                      <ShieldCheck size={11} /> 300 DPI
                    </span>
                  </div>
                  <div className="bf-export-btn-group" role="group" aria-label="Resolution">
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${resolution === "1x" ? "is-active" : ""}`}
                      onClick={() => setResolution("1x")}
                    >
                      1x (1080p)
                    </button>
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${resolution === "2x" ? "is-active" : ""}`}
                      onClick={() => setResolution("2x")}
                    >
                      2x (QHD)
                    </button>
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${resolution === "4k" ? "is-active" : ""}`}
                      onClick={() => setResolution("4k")}
                    >
                      4K Ultra
                    </button>
                  </div>
                </div>

                {/* Background */}
                <div className="bf-export-option-card">
                  <label>Background</label>
                  <div className="bf-export-btn-group" role="group" aria-label="Background">
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${background === "white" ? "is-active" : ""}`}
                      onClick={() => setBackground("white")}
                      title="Pure white for manuscripts and articles (Nature/Science style)"
                    >
                      White
                    </button>
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${background === "transparent" ? "is-active" : ""}`}
                      onClick={() => setBackground("transparent")}
                      title="Alpha transparency for poster cutouts and slides"
                    >
                      Transparent
                    </button>
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${background === "dark" ? "is-active" : ""}`}
                      onClick={() => setBackground("dark")}
                      title="Studio dark view"
                    >
                      Dark
                    </button>
                  </div>
                </div>

                {/* Format */}
                <div className="bf-export-option-card">
                  <label>Format</label>
                  <div className="bf-export-btn-group" role="group" aria-label="File Format">
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${format === "png" ? "is-active" : ""}`}
                      onClick={() => setFormat("png")}
                    >
                      PNG (Lossless)
                    </button>
                    <button
                      type="button"
                      className={`bf-export-choice-btn ${format === "jpeg" ? "is-active" : ""}`}
                      onClick={() => setFormat("jpeg")}
                    >
                      JPEG (High Q)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "report" && (
            <>
              {/* Report Title */}
              <div className="bf-export-option-card">
                <label htmlFor="report-title-input">Report Document Title</label>
                <input
                  id="report-title-input"
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    background: "#08110e",
                    border: "1px solid var(--bf-line, #1e2c26)",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
              </div>

              {/* Included Sections */}
              <div className="bf-export-option-card">
                <label>Include Sections in Report</label>
                <div className="bf-report-sections-list">
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.summary}
                        onChange={(e) => setSections({ ...sections, summary: e.target.checked })}
                      />
                      <span>1. Macromolecular Specifications (Chains, Residues, Atoms)</span>
                    </label>
                  </div>
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.figure}
                        onChange={(e) => setSections({ ...sections, figure: e.target.checked })}
                      />
                      <span>2. 3D Structural Architecture (Embedded Figure)</span>
                    </label>
                  </div>
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.measurements}
                        onChange={(e) => setSections({ ...sections, measurements: e.target.checked })}
                      />
                      <span>3. Atomic Distance Measurements Table</span>
                    </label>
                    <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>
                      {activeMeasurement ? "1 active" : "0 active"}
                    </span>
                  </div>
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.mutations}
                        onChange={(e) => setSections({ ...sections, mutations: e.target.checked })}
                      />
                      <span>4. In Silico Variant Benchmark (Workbench Heuristics)</span>
                    </label>
                    <span style={{ fontSize: "11px", color: "var(--bf-muted, #79918b)" }}>
                      {activeMutation ? "1 active" : "0 active"}
                    </span>
                  </div>
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.annotations}
                        onChange={(e) => setSections({ ...sections, annotations: e.target.checked })}
                      />
                      <span>5. Functional Annotations (UniProt / ClinVar & 3D Bookmarks)</span>
                    </label>
                  </div>
                  <div className="bf-report-sec-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={sections.copilot}
                        onChange={(e) => setSections({ ...sections, copilot: e.target.checked })}
                      />
                      <span>6. AI Research Copilot Scientific Assessment</span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <footer className="bf-export-footer">
          {activeTab === "figure" && (
            <>
              <button
                type="button"
                className="bf-export-action-btn secondary"
                onClick={handleCopyClipboard}
                disabled={!previewUrl || isCapturing}
                title="Copy figure to clipboard"
              >
                {justCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>{justCopied ? "Copied!" : "Copy to Clipboard"}</span>
              </button>
              <button
                type="button"
                className="bf-export-action-btn primary"
                onClick={handleDownloadFigure}
                disabled={!previewUrl || isCapturing}
              >
                <Download size={14} />
                <span>Download Figure ({format.toUpperCase()})</span>
              </button>
            </>
          )}

          {activeTab === "report" && (
            <>
              <button
                type="button"
                className="bf-export-action-btn secondary"
                onClick={handleDownloadMarkdown}
                title="Download academic report in clean Markdown (.md) format"
              >
                <FileDown size={14} />
                <span>Download Markdown (.md)</span>
              </button>
              <button
                type="button"
                className="bf-export-action-btn primary"
                onClick={handlePrintPdf}
                title="Open formatted academic paper view and save as PDF"
              >
                <Printer size={14} />
                <span>Print / Save as PDF</span>
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

export default ExportFigureAndReportModal;
