/**
 * Figure Export Service
 * Produces publication-ready (4K / 300 DPI) figures for scientific journals (Nature, Science, ACS).
 * Supports pure white, transparent, and studio dark backgrounds with lossless PNG and high-Q JPEG.
 */

export interface FigureExportOptions {
  resolution?: "1x" | "2x" | "4k";
  background?: "white" | "transparent" | "dark";
  format?: "png" | "jpeg";
  quality?: number; // 0.1 to 1.0 (default 0.95 for jpeg)
  dpi?: number; // default 300
}

/**
 * Standard CRC32 table for PNG chunk checksum calculation.
 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  CRC_TABLE[n] = c;
}

function crc32(buffer: Uint8Array, offset: number, length: number): number {
  let crc = -1;
  for (let i = 0; i < length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[offset + i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Inserts or updates the PNG pHYs chunk to declare physical resolution (e.g. 300 DPI).
 * 300 DPI = 300 / 0.0254 = ~11811 pixels per meter.
 */
export function insertDpiMetadataToPng(pngDataUrl: string, dpi = 300): string {
  if (!pngDataUrl.startsWith("data:image/png;base64,")) {
    return pngDataUrl;
  }

  try {
    const base64Data = pngDataUrl.replace("data:image/png;base64,", "");
    const binaryStr = typeof atob === "function" ? atob(base64Data) : Buffer.from(base64Data, "base64").toString("binary");
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Verify PNG signature (8 bytes: 137, 80, 78, 71, 13, 10, 26, 10)
    if (
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47
    ) {
      return pngDataUrl;
    }

    // Calculate pixels per meter (1 meter = 39.3701 inches)
    const ppm = Math.round(dpi / 0.0254);

    // Build pHYs chunk: 4 bytes len (9) + 4 bytes 'pHYs' + 4 bytes X + 4 bytes Y + 1 byte unit (meter = 1) + 4 bytes CRC
    const physChunk = new Uint8Array(21);
    const view = new DataView(physChunk.buffer);

    // Length = 9
    view.setUint32(0, 9);
    // Type = 'pHYs' (0x70 0x48 0x59 0x73)
    physChunk[4] = 0x70;
    physChunk[5] = 0x48;
    physChunk[6] = 0x59;
    physChunk[7] = 0x73;
    // Data: X pixels per meter
    view.setUint32(8, ppm);
    // Data: Y pixels per meter
    view.setUint32(12, ppm);
    // Unit = 1 (meter)
    physChunk[16] = 1;

    // CRC over type + data (bytes 4..16, length 13)
    const crc = crc32(physChunk, 4, 13);
    view.setUint32(17, crc);

    // Locate IHDR chunk (starts at byte 8)
    // IHDR length is at bytes 8..11 (normally 13), type at 12..15, data 16..28, CRC 29..32
    // So IHDR ends at byte 33.
    const ihdrEnd = 33;
    if (len < ihdrEnd) return pngDataUrl;

    // Check if a pHYs chunk already exists right after IHDR
    let insertPos = ihdrEnd;
    const nextType = String.fromCharCode(bytes[ihdrEnd + 4], bytes[ihdrEnd + 5], bytes[ihdrEnd + 6], bytes[ihdrEnd + 7]);
    let existingLength = 0;
    if (nextType === "pHYs") {
      existingLength = 12 + new DataView(bytes.buffer).getUint32(ihdrEnd);
    }

    // Assemble new buffer with pHYs inserted
    const newLength = len - existingLength + physChunk.length;
    const combined = new Uint8Array(newLength);
    combined.set(bytes.subarray(0, insertPos), 0);
    combined.set(physChunk, insertPos);
    combined.set(bytes.subarray(insertPos + existingLength), insertPos + physChunk.length);

    // Convert back to base64
    let resultBinary = "";
    const chunkStep = 8192;
    for (let i = 0; i < combined.length; i += chunkStep) {
      const slice = combined.subarray(i, i + chunkStep);
      resultBinary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    const newBase64 = typeof btoa === "function" ? btoa(resultBinary) : Buffer.from(resultBinary, "binary").toString("base64");
    return `data:image/png;base64,${newBase64}`;
  } catch (err) {
    console.warn("Failed to inject DPI metadata:", err);
    return pngDataUrl;
  }
}

/**
 * Downloads a data URL or Blob to the user's computer with the specified filename.
 */
export function downloadBlobOrDataUrl(urlOrBlob: string | Blob, filename: string): void {
  if (typeof document === "undefined") return;

  const url = typeof urlOrBlob === "string" ? urlOrBlob : URL.createObjectURL(urlOrBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (typeof urlOrBlob !== "string") {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/**
 * Copies an image data URL to the clipboard as PNG image.
 */
export async function copyDataUrlToClipboard(dataUrl: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn("Clipboard copy failed:", err);
    return false;
  }
}

/**
 * Captures a publication-grade figure from the viewer port with specified resolution and background.
 */
export async function capturePublicationFigure(
  viewerPort: any,
  options: FigureExportOptions = {},
): Promise<string | null> {
  const {
    resolution = "4k",
    background = "white",
    format = "png",
    quality = 0.95,
    dpi = 300,
  } = options;

  if (!viewerPort) return null;

  // 1. If viewerPort has custom capture method, use it
  if (typeof viewerPort.captureCustomFigure === "function") {
    const customUri = await viewerPort.captureCustomFigure({ resolution, background, format, quality });
    if (customUri && format === "png") {
      return insertDpiMetadataToPng(customUri, dpi);
    }
    return customUri;
  }

  // 2. Default capture via standard capturePngURI
  const uri = viewerPort.capturePngURI?.();
  if (!uri) return null;

  if (format === "png") {
    return insertDpiMetadataToPng(uri, dpi);
  }
  return uri;
}
