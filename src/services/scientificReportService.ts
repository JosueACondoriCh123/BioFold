/**
 * Scientific Report Service
 * Compiles laboratory sessions, structural metadata, atomic measurements,
 * in silico mutation benchmarks, annotations, and Copilot assessments into
 * formal academic publication reports (PDF / Markdown).
 */

export interface StructureReportData {
  pdbId: string;
  name?: string;
  organism?: string;
  method?: string;
  resolution?: string;
  chainCount?: number;
  residueCount?: number;
  atomCount?: number;
  ligandCount?: number;
}

export interface MeasurementReportItem {
  from: string;
  to: string;
  angstroms: number;
}

export interface MutationReportItem {
  residue: string;
  original: string;
  target: string;
  neighborCount: number;
  heuristics: Array<{ dimension: string; note: string }>;
}

export interface AnnotationReportItem {
  type: "catalytic" | "variant" | "bookmark";
  label: string;
  detail: string;
}

export interface ScientificReportCompilation {
  title: string;
  projectTitle?: string;
  author?: string;
  date?: string;
  structure: StructureReportData;
  viewStyle?: {
    representation?: string;
    colorScheme?: string;
  };
  figureDataUrl?: string | null;
  measurements?: MeasurementReportItem[];
  mutations?: MutationReportItem[];
  annotations?: AnnotationReportItem[];
  copilotSummary?: string;
  includedSections?: {
    summary?: boolean;
    figure?: boolean;
    measurements?: boolean;
    mutations?: boolean;
    annotations?: boolean;
    copilot?: boolean;
  };
}

/**
 * Generates formatted, clean academic Markdown from report data.
 */
export function generateMarkdownReport(report: ScientificReportCompilation): string {
  const sections = report.includedSections ?? {
    summary: true,
    figure: true,
    measurements: true,
    mutations: true,
    annotations: true,
    copilot: true,
  };

  const lines: string[] = [];
  const repDate = report.date ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const viewRep = report.viewStyle?.representation ?? "cartoon";
  const viewColor = report.viewStyle?.colorScheme ?? "chain";
  const measurements = report.measurements ?? [];
  const mutations = report.mutations ?? [];
  const annotations = report.annotations ?? [];

  // Header
  lines.push(`# ${report.title}`);
  if (report.projectTitle) {
    lines.push(`**Project:** ${report.projectTitle}`);
  }
  lines.push(`**Target Structure:** ${report.structure.pdbId} ${report.structure.name ? `(${report.structure.name})` : ""}`);
  lines.push(`**Generated:** ${repDate}`);
  if (report.author) {
    lines.push(`**Researcher:** ${report.author}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // 1. Structure Summary
  if (sections.summary !== false) {
    lines.push("## 1. Macromolecular Specifications");
    lines.push("");
    lines.push("| Specification | Value |");
    lines.push("|:---|:---|");
    lines.push(`| **PDB / Model ID** | \`${report.structure.pdbId}\` |`);
    if (report.structure.organism) lines.push(`| **Source Organism** | ${report.structure.organism} |`);
    if (report.structure.method) lines.push(`| **Experimental Method** | ${report.structure.method} |`);
    if (report.structure.resolution) lines.push(`| **Resolution** | ${report.structure.resolution} |`);
    if (report.structure.chainCount !== undefined) lines.push(`| **Polypeptide Chains** | ${report.structure.chainCount} |`);
    if (report.structure.residueCount !== undefined) lines.push(`| **Total Residues** | ${report.structure.residueCount} |`);
    if (report.structure.atomCount !== undefined) lines.push(`| **Coordinate Atoms** | ${report.structure.atomCount.toLocaleString()} |`);
    if (report.structure.ligandCount !== undefined) lines.push(`| **Heteroatom Ligands** | ${report.structure.ligandCount} |`);
    lines.push(`| **Visualization Mode** | ${viewRep} (Color: ${viewColor}) |`);
    lines.push("");
  }

  // 2. High-Res Figure
  if (sections.figure !== false && report.figureDataUrl) {
    lines.push("## 2. 3D Structural Architecture");
    lines.push("");
    lines.push(`![Structure ${report.structure.pdbId}](${report.figureDataUrl})`);
    lines.push("");
    lines.push(`*Figure 1: High-resolution visual representation of ${report.structure.pdbId} rendered in BioFold 3D with ${viewRep} model.*`);
    lines.push("");
  }

  // 3. Atomic Measurements
  if (sections.measurements !== false && measurements.length > 0) {
    lines.push("## 3. Atomic Distance Measurements");
    lines.push("");
    lines.push("| # | Atom Origin (From) | Atom Target (To) | Distance (Å) |");
    lines.push("|:---|:---|:---|:---|");
    measurements.forEach((m, idx) => {
      lines.push(`| ${idx + 1} | \`${m.from}\` | \`${m.to}\` | **${m.angstroms.toFixed(2)} Å** |`);
    });
    lines.push("");
  }

  // 4. In Silico Mutations
  if (sections.mutations !== false && mutations.length > 0) {
    lines.push("## 4. In Silico Variant Benchmark (Workbench)");
    lines.push("");
    lines.push("| Residue | Wild Type | Variant | Local Neighbors (<5Å) | Biochemical Impact Notes |");
    lines.push("|:---|:---|:---|:---|:---|");
    mutations.forEach((mut) => {
      const notes = mut.heuristics.map((h) => `• **${h.dimension}**: ${h.note}`).join("<br/>");
      lines.push(`| \`${mut.residue}\` | **${mut.original}** | **${mut.target}** | ${mut.neighborCount} residues | ${notes || "No heuristic divergence"} |`);
    });
    lines.push("");
  }

  // 5. Biological Annotations & Bookmarks
  if (sections.annotations !== false && annotations.length > 0) {
    lines.push("## 5. Functional Annotations & Curated 3D Bookmarks");
    lines.push("");
    lines.push("| Type | Target / Location | Annotation Details |");
    lines.push("|:---|:---|:---|");
    annotations.forEach((ann) => {
      const typeBadge = ann.type === "catalytic" ? "Catalytic Site" : ann.type === "variant" ? "ClinVar Variant" : "3D Bookmark";
      lines.push(`| **${typeBadge}** | \`${ann.label}\` | ${ann.detail} |`);
    });
    lines.push("");
  }

  // 6. Copilot Assessment
  if (sections.copilot !== false && report.copilotSummary) {
    lines.push("## 6. AI Research Copilot Findings & Scientific Assessment");
    lines.push("");
    lines.push(report.copilotSummary);
    lines.push("");
  }

  // Footer & Disclaimer
  lines.push("---");
  lines.push("");
  lines.push("*Generated by BioFold 3D · Agentic Molecular Workbench for Structural Biology.*");
  lines.push("*Note: Structural coordinates, distances, and heuristics are intended for academic exploration and scientific hypothesis generation.*");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generates an academic publication HTML document with @media print CSS for printing or saving to PDF.
 */
export function generateHtmlReport(report: ScientificReportCompilation): string {
  const sections = report.includedSections ?? {
    summary: true,
    figure: true,
    measurements: true,
    mutations: true,
    annotations: true,
    copilot: true,
  };
  const repDate = report.date ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const viewRep = report.viewStyle?.representation ?? "cartoon";
  const viewColor = report.viewStyle?.colorScheme ?? "chain";
  const measurements = report.measurements ?? [];
  const mutations = report.mutations ?? [];
  const annotations = report.annotations ?? [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.title} - ${report.structure.pdbId}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a202c;
      line-height: 1.5;
      font-size: 13px;
      margin: 0;
      padding: 24px;
      background: #fff;
    }
    .report-header {
      border-bottom: 2px solid #2d3748;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .report-brand {
      font-size: 18px;
      font-weight: 800;
      color: #0d9488;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
    }
    .report-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 6px;
    }
    .report-meta {
      font-size: 12px;
      color: #4b5563;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    h2 {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      margin: 20px 0 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
    }
    code {
      font-family: monospace;
      background: #f1f5f9;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 11px;
    }
    .figure-container {
      text-align: center;
      margin: 16px 0;
      page-break-inside: avoid;
    }
    .figure-img {
      max-width: 100%;
      max-height: 380px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      object-fit: contain;
    }
    .figure-caption {
      font-size: 11px;
      color: #64748b;
      margin-top: 6px;
      font-style: italic;
    }
    .copilot-box {
      background: #f8fafc;
      border-left: 4px solid #0d9488;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      font-size: 12px;
      color: #334155;
      page-break-inside: avoid;
    }
    .report-footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-brand">BioFold 3D · Structural Biology Lab Report</div>
    <h1 class="report-title">${report.title}</h1>
    <div class="report-meta">
      <span><strong>Target:</strong> ${report.structure.pdbId} ${report.structure.name ? `· ${report.structure.name}` : ""}</span>
      <span><strong>Date:</strong> ${repDate}</span>
      ${report.author ? `<span><strong>Author:</strong> ${report.author}</span>` : ""}
    </div>
  </div>

  ${sections.summary !== false ? `
  <h2>1. Macromolecular Specifications</h2>
  <table>
    <tr><th style="width: 35%;">Parameter</th><th>Observed Value</th></tr>
    <tr><td><strong>PDB Identifier</strong></td><td><code>${report.structure.pdbId}</code></td></tr>
    ${report.structure.organism ? `<tr><td><strong>Organism</strong></td><td>${report.structure.organism}</td></tr>` : ""}
    ${report.structure.method ? `<tr><td><strong>Method</strong></td><td>${report.structure.method}</td></tr>` : ""}
    ${report.structure.resolution ? `<tr><td><strong>Resolution</strong></td><td>${report.structure.resolution}</td></tr>` : ""}
    ${report.structure.chainCount !== undefined ? `<tr><td><strong>Polypeptide Chains</strong></td><td>${report.structure.chainCount}</td></tr>` : ""}
    ${report.structure.residueCount !== undefined ? `<tr><td><strong>Total Residues</strong></td><td>${report.structure.residueCount}</td></tr>` : ""}
    ${report.structure.atomCount !== undefined ? `<tr><td><strong>Coordinate Atoms</strong></td><td>${report.structure.atomCount.toLocaleString()}</td></tr>` : ""}
    ${report.structure.ligandCount !== undefined ? `<tr><td><strong>Hetero Ligands</strong></td><td>${report.structure.ligandCount}</td></tr>` : ""}
    <tr><td><strong>3D Visual Style</strong></td><td>${viewRep} (Color: ${viewColor})</td></tr>
  </table>` : ""}

  ${sections.figure !== false && report.figureDataUrl ? `
  <h2>2. Structural Architecture</h2>
  <div class="figure-container">
    <img class="figure-img" src="${report.figureDataUrl}" alt="Structure ${report.structure.pdbId}" />
    <div class="figure-caption">Figure 1: High-resolution visual snapshot of macromolecule ${report.structure.pdbId}.</div>
  </div>` : ""}

  ${sections.measurements !== false && measurements.length > 0 ? `
  <h2>3. Atomic Distance Measurements</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Atom Origin</th><th>Atom Target</th><th>Distance (Å)</th></tr>
    </thead>
    <tbody>
      ${measurements.map((m, i) => `<tr><td>${i + 1}</td><td><code>${m.from}</code></td><td><code>${m.to}</code></td><td><strong>${m.angstroms.toFixed(2)} Å</strong></td></tr>`).join("")}
    </tbody>
  </table>` : ""}

  ${sections.mutations !== false && mutations.length > 0 ? `
  <h2>4. In Silico Variant Benchmark (Workbench)</h2>
  <table>
    <thead>
      <tr><th>Residue</th><th>Wild Type</th><th>Variant</th><th>Neighbors (&lt;5Å)</th><th>Biochemical Impact Notes</th></tr>
    </thead>
    <tbody>
      ${mutations.map((m) => `<tr>
        <td><code>${m.residue}</code></td>
        <td><strong>${m.original}</strong></td>
        <td><strong>${m.target}</strong></td>
        <td>${m.neighborCount} residues</td>
        <td>${m.heuristics.map((h) => `• <strong>${h.dimension}:</strong> ${h.note}`).join("<br/>") || "No divergence"}</td>
      </tr>`).join("")}
    </tbody>
  </table>` : ""}

  ${sections.annotations !== false && annotations.length > 0 ? `
  <h2>5. Functional Annotations & 3D Bookmarks</h2>
  <table>
    <thead>
      <tr><th>Category</th><th>Residue / Target</th><th>Observation Details</th></tr>
    </thead>
    <tbody>
      ${annotations.map((a) => `<tr>
        <td><strong>${a.type === "catalytic" ? "Catalytic Site" : a.type === "variant" ? "ClinVar Variant" : "3D Bookmark"}</strong></td>
        <td><code>${a.label}</code></td>
        <td>${a.detail}</td>
      </tr>`).join("")}
    </tbody>
  </table>` : ""}

  ${sections.copilot !== false && report.copilotSummary ? `
  <h2>6. AI Research Copilot Scientific Assessment</h2>
  <div class="copilot-box">
    ${report.copilotSummary.replace(/\n/g, "<br/>")}
  </div>` : ""}

  <div class="report-footer">
    BioFold 3D Molecular Workbench · Research Quality Structural Biology Report
  </div>

  <script>
    window.addEventListener("DOMContentLoaded", () => {
      // Auto-trigger print dialog for PDF saving
      setTimeout(() => window.print(), 300);
    });
  </script>
</body>
</html>`;
}

/**
 * Opens a print-ready window and triggers native PDF print dialog.
 */
export function openPrintableReportWindow(report: ScientificReportCompilation): boolean {
  if (typeof window === "undefined") return false;

  const html = generateHtmlReport(report);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    if (typeof alert === "function") {
      alert("Popup was blocked. Please allow popups to generate the printable PDF report.");
    }
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}
