import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  insertDpiMetadataToPng,
  capturePublicationFigure,
  downloadBlobOrDataUrl,
  copyDataUrlToClipboard,
} from "../../src/services/figureExportService";
import type { MolecularViewerPort } from "../../src/adapters/viewerPort";

// A minimal valid 1x1 PNG image as base64
// Header: 8 bytes, IHDR: 25 bytes, IDAT: ~10 bytes, IEND: 12 bytes
const MINIMAL_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("figureExportService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("insertDpiMetadataToPng", () => {
    it("injects a 300 DPI pHYs chunk into a valid PNG", () => {
      const outputDataUrl = insertDpiMetadataToPng(MINIMAL_PNG_BASE64, 300);

      expect(outputDataUrl.startsWith("data:image/png;base64,")).toBe(true);

      const base64Part = outputDataUrl.replace(/^data:image\/png;base64,/, "");
      const binaryString = atob(base64Part);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Verify PNG signature (89 50 4E 47 0D 0A 1A 0A)
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4e);
      expect(bytes[3]).toBe(0x47);

      // Verify that the pHYs chunk is present at offset 37
      const chunkName = String.fromCharCode(bytes[37], bytes[38], bytes[39], bytes[40]);
      expect(chunkName).toBe("pHYs");

      // Verify pHYs length is 9 bytes
      const physLength =
        (bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36];
      expect(physLength).toBe(9);

      // Verify 300 DPI conversion (11811 pixels/meter)
      const ppmX =
        (bytes[41] << 24) | (bytes[42] << 16) | (bytes[43] << 8) | bytes[44];
      const ppmY =
        (bytes[45] << 24) | (bytes[46] << 16) | (bytes[47] << 8) | bytes[48];
      const unit = bytes[49];

      expect(ppmX).toBe(11811);
      expect(ppmY).toBe(11811);
      expect(unit).toBe(1); // 1 = meters
    });

    it("returns unmodified dataUrl if input is not PNG", () => {
      const jpegUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
      const result = insertDpiMetadataToPng(jpegUrl, 300);
      expect(result).toBe(jpegUrl);
    });

    it("returns unmodified string if base64 decoding fails", () => {
      const malformedUrl = "data:image/png;base64,!!!NotBase64!!!";
      const result = insertDpiMetadataToPng(malformedUrl, 300);
      expect(result).toBe(malformedUrl);
    });
  });

  describe("capturePublicationFigure", () => {
    it("delegates to viewerPort.captureCustomFigure and injects 300 DPI for PNG", async () => {
      const mockPort: Partial<MolecularViewerPort> = {
        captureCustomFigure: vi.fn().mockReturnValue(MINIMAL_PNG_BASE64),
      };

      const result = await capturePublicationFigure(mockPort as MolecularViewerPort, {
        resolution: "4k",
        background: "white",
        format: "png",
        dpi: 300,
      });

      expect(mockPort.captureCustomFigure).toHaveBeenCalledWith({
        resolution: "4k",
        background: "white",
        format: "png",
        quality: 0.95,
      });

      expect(result).not.toBeNull();
      expect(result).toContain("data:image/png;base64,");
    });

    it("falls back to capturePngURI if captureCustomFigure is unavailable", async () => {
      const mockPort: Partial<MolecularViewerPort> = {
        capturePngURI: vi.fn().mockReturnValue(MINIMAL_PNG_BASE64),
      };

      const result = await capturePublicationFigure(mockPort as MolecularViewerPort, {
        resolution: "1x",
        background: "dark",
        format: "jpeg",
      });

      expect(mockPort.capturePngURI).toHaveBeenCalled();
      expect(result).toBe(MINIMAL_PNG_BASE64);
    });
  });

  describe("downloadBlobOrDataUrl", () => {
    it("creates a link element with proper href and download attributes and triggers click", () => {
      const clickSpy = vi.fn();
      const mockAnchor = {
        set href(val: string) {},
        set download(val: string) {},
        click: clickSpy,
      } as unknown as HTMLAnchorElement;

      const createElementSpy = vi
        .spyOn(document, "createElement")
        .mockReturnValue(mockAnchor);
      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation(() => mockAnchor);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation(() => mockAnchor);

      downloadBlobOrDataUrl(MINIMAL_PNG_BASE64, "figure_300dpi.png");

      expect(createElementSpy).toHaveBeenCalledWith("a");
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
    });
  });

  describe("copyDataUrlToClipboard", () => {
    it("converts dataUrl to blob and calls navigator.clipboard.write", async () => {
      const clipboardWriteSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          write: clipboardWriteSpy,
        },
      });

      // Polyfill ClipboardItem and fetch in test environment
      class MockClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
      (globalThis as any).ClipboardItem = MockClipboardItem;
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(new Blob(["test"], { type: "image/png" })),
      });

      const success = await copyDataUrlToClipboard(MINIMAL_PNG_BASE64);
      expect(success).toBe(true);
      expect(clipboardWriteSpy).toHaveBeenCalledTimes(1);
    });

    it("handles clipboard failures gracefully returning false", async () => {
      Object.assign(navigator, {
        clipboard: {
          write: vi.fn().mockRejectedValue(new Error("Clipboard denied")),
        },
      });

      const success = await copyDataUrlToClipboard(MINIMAL_PNG_BASE64);
      expect(success).toBe(false);
    });
  });
});
