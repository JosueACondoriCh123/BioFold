import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportFigureAndReportModal } from "../../src/features/export/ExportFigureAndReportModal";
import * as figureService from "../../src/services/figureExportService";
import * as reportService from "../../src/services/scientificReportService";
import { viewerPort } from "../../src/adapters/viewerPort";

const MOCK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

vi.mock("../../src/adapters/viewerPort", () => ({
  viewerPort: {
    captureCustomFigure: vi.fn().mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    ),
    capturePngURI: vi.fn().mockReturnValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    ),
    isReady: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("../../src/services/bookmarkService", () => ({
  listBookmarks: vi.fn().mockResolvedValue([
    {
      id: "bm-1",
      pdbId: "6LU7",
      chain: "A",
      residueNumber: 145,
      note: "Catalytic cysteine",
      color: "#5ccfb5",
      createdAt: "2026-09-04T00:00:00Z",
    },
  ]),
}));

vi.mock("../../src/services/uniprotAnnotationService", () => ({
  getBiologicalAnnotations: vi.fn().mockResolvedValue({
    pdbId: "6LU7",
    uniprotAccession: "P0DTD1",
    proteinName: "Replicase polyprotein 1ab",
    geneName: "rep",
    organism: "SARS-CoV-2",
    activeSites: [
      {
        type: "active_site",
        chain: "A",
        residueNumber: 145,
        aminoAcid: "Cys",
        description: "Catalytic Dyad Nucleophile (Cys145)",
      },
    ],
    variants: [],
    disulfideBonds: [],
  }),
}));

describe("ExportFigureAndReportModal Component", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    pdbId: "6LU7",
    structureName: "SARS-CoV-2 Mpro with N3 inhibitor",
    summary: {
      id: "6LU7",
      title: "Crystal structure of COVID-19 main protease in complex with an inhibitor N3",
      chains: ["A", "C"],
      chainCount: 2,
      residueCount: 306,
      atomCount: 2370,
      ligands: ["N3", "DMS"],
      ligandCount: 2,
      waterCount: 150,
      resolution: 2.16,
    },
    currentRepresentation: "cartoon",
    currentColorScheme: "chain",
    activityEntries: [],
    projectId: "proj-covid19",
    projectTitle: "COVID-19 Therapeutics Investigation",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(viewerPort.captureCustomFigure).mockResolvedValue(MOCK_PNG);
    vi.mocked(viewerPort.capturePngURI).mockReturnValue(MOCK_PNG);
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ExportFigureAndReportModal {...defaultProps} isOpen={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders Figure Exporter tab by default with resolution and background options", async () => {
    render(<ExportFigureAndReportModal {...defaultProps} />);

    expect(screen.getByText("Export Figure & Scientific Report")).toBeInTheDocument();
    expect(screen.getByText("Publication Figure (4K / 300 DPI)")).toBeInTheDocument();
    expect(screen.getByText("Scientific Report (PDF / Markdown)")).toBeInTheDocument();

    // Verify resolution buttons
    expect(screen.getByRole("button", { name: /4K Ultra/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2x \(QHD\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1x \(1080p\)/i })).toBeInTheDocument();

    // Verify background options
    expect(screen.getByRole("button", { name: /White/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Transparent/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dark/i })).toBeInTheDocument();

    // Click 2x resolution
    const res2xBtn = screen.getByRole("button", { name: /2x \(QHD\)/i });
    fireEvent.click(res2xBtn);
    expect(res2xBtn).toHaveClass("is-active");

    // Click Transparent background
    const bgTransparentBtn = screen.getByRole("button", { name: /Transparent/i });
    fireEvent.click(bgTransparentBtn);
    expect(bgTransparentBtn).toHaveClass("is-active");
  });

  it("triggers figure download when Download Figure button is clicked", async () => {
    const downloadSpy = vi
      .spyOn(figureService, "downloadBlobOrDataUrl")
      .mockImplementation(() => {});

    render(<ExportFigureAndReportModal {...defaultProps} />);

    const downloadBtn = screen.getByRole("button", { name: /Download Figure/i });
    expect(downloadBtn).toBeInTheDocument();

    await waitFor(() => {
      expect(downloadBtn).not.toBeDisabled();
    });

    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalled();
    });
  });

  it("switches to Scientific Report tab, allows configuring sections, and triggers Markdown download", async () => {
    const downloadSpy = vi
      .spyOn(figureService, "downloadBlobOrDataUrl")
      .mockImplementation(() => {});

    render(<ExportFigureAndReportModal {...defaultProps} />);

    // Switch tab
    const reportTabBtn = screen.getByRole("tab", { name: /Scientific Report/i });
    fireEvent.click(reportTabBtn);

    expect(screen.getByText("Report Document Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Report Document Title")).toBeInTheDocument();

    // Verify toggles
    expect(screen.getByText(/1\. Macromolecular Specifications/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. 3D Structural Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Atomic Distance Measurements Table/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. In Silico Variant Benchmark/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Functional Annotations/i)).toBeInTheDocument();

    // Edit title
    const titleInput = screen.getByLabelText("Report Document Title");
    fireEvent.change(titleInput, { target: { value: "Updated Custom Dossier Title" } });
    expect(titleInput).toHaveValue("Updated Custom Dossier Title");

    // Wait for report compilation
    const downloadMdBtn = screen.getByRole("button", { name: /Download Markdown/i });
    await waitFor(() => {
      expect(downloadMdBtn).not.toBeDisabled();
    });

    fireEvent.click(downloadMdBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalled();
    });
  });

  it("triggers Print / Save PDF via openPrintableReportWindow", async () => {
    const printSpy = vi
      .spyOn(reportService, "openPrintableReportWindow")
      .mockReturnValue(true);

    render(<ExportFigureAndReportModal {...defaultProps} />);

    // Switch to report tab
    fireEvent.click(screen.getByRole("tab", { name: /Scientific Report/i }));

    const printBtn = screen.getByRole("button", { name: /Print \/ Save as PDF/i });
    await waitFor(() => {
      expect(printBtn).not.toBeDisabled();
    });

    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(printSpy).toHaveBeenCalled();
    });
  });

  it("calls onClose when the close icon button is clicked", () => {
    const handleClose = vi.fn();
    render(<ExportFigureAndReportModal {...defaultProps} onClose={handleClose} />);

    const closeBtn = screen.getByLabelText("Close export dialog");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
