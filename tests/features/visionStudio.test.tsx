import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import VisionStudioPage from "../../src/pages/VisionStudioPage";
import {
  extractPdbCodes,
  analyzeImageWithModel,
} from "../../src/features/vision/visionService";
import { MULTIMODAL_MODELS } from "../../src/features/vision/visionPresets";

afterEach(cleanup);

describe("Vision Studio Feature & Multimodal Model Tests", () => {
  describe("visionService unit tests", () => {
    it("extracts valid PDB codes and filters invalid codes/years", () => {
      const text = "Compare structure 6LU7 and 1CRN with binding pocket 4HHB in year 2024 and 1999.";
      const pdbs = extractPdbCodes(text);
      expect(pdbs).toContain("6LU7");
      expect(pdbs).toContain("1CRN");
      expect(pdbs).toContain("4HHB");
      expect(pdbs).not.toContain("2024");
      expect(pdbs).not.toContain("1999");
    });

    it("performs structural visual analysis with fallback engine", async () => {
      const result = await analyzeImageWithModel({
        model: "minimax/minimax-01",
        prompt: "Analyze the active site cavity and catalytic dyad in 6LU7",
        imageDataUri: "data:image/png;base64,fakeimg",
      });

      expect(result.content).toContain("Cys145");
      expect(result.content).toContain("His41");
      expect(result.detectedPdbs).toContain("6LU7");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("performs AlphaFold PAE matrix visual interpretation", async () => {
      const result = await analyzeImageWithModel({
        model: "google/gemini-2.0-flash-lite:free",
        prompt: "Interpret the AlphaFold PAE confidence map",
        imageDataUri: "data:image/svg+xml;utf8,<svg></svg>",
      });

      expect(result.content).toContain("AlphaFold");
      expect(result.content).toContain("Domain 1");
      expect(result.content).toContain("Predicted Aligned Error");
    });
  });

  describe("VisionStudioPage Component", () => {
    it("renders heading, model selector with MiniMax-01, and preloaded scientific examples", () => {
      render(
        <MemoryRouter>
          <VisionStudioPage />
        </MemoryRouter>,
      );

      expect(screen.getByRole("heading", { name: "Multimodal Vision Studio" })).toBeInTheDocument();
      expect(screen.getByLabelText("Select multimodal model")).toBeInTheDocument();
      expect(screen.getByText(/MiniMax-01 Multimodal/)).toBeInTheDocument();
      expect(screen.getByText("AlphaFold 3 PAE Matrix")).toBeInTheDocument();
      expect(screen.getByText(/SARS-CoV-2 Mpro/)).toBeInTheDocument();
    });

    it("loads preloaded sample image and enables quick analysis actions", async () => {
      render(
        <MemoryRouter>
          <VisionStudioPage />
        </MemoryRouter>,
      );

      // Click on preloaded sample
      const sampleBtn = screen.getByText("AlphaFold 3 PAE Matrix").closest("button");
      expect(sampleBtn).not.toBeNull();
      fireEvent.click(sampleBtn!);

      // Image should now be loaded
      expect(screen.getAllByAltText("AlphaFold 3 PAE Matrix").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Loaded:")).toBeInTheDocument();

      // Click quick action "Binding Cavity & Pockets"
      const quickActionBtn = screen.getByRole("button", { name: "Binding Cavity & Pockets" });
      expect(quickActionBtn).not.toBeDisabled();
      fireEvent.click(quickActionBtn);

      // Should show analyzing state then response
      await waitFor(
        () => {
          expect(screen.getByText(/Vision Copilot/)).toBeInTheDocument();
        },
        { timeout: 5000 },
      );
    });

    it("hydrates pending 3D scene snapshot from sessionStorage", () => {
      sessionStorage.setItem("biofold_pending_vision_snapshot", "data:image/png;base64,captured3dscene");
      sessionStorage.setItem("biofold_pending_vision_target", "7C22");

      render(
        <MemoryRouter>
          <VisionStudioPage />
        </MemoryRouter>,
      );

      expect(screen.getByAltText("3D Scene Snapshot (7C22)")).toBeInTheDocument();
      expect(screen.getByText(/3D Scene Snapshot \(7C22\)/)).toBeInTheDocument();
      expect(sessionStorage.getItem("biofold_pending_vision_snapshot")).toBeNull();
    });
  });
});
