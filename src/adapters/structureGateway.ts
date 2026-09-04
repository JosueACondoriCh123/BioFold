import type { CommandErrorCode } from "../types/domain";
import { getCachedStructure, setCachedStructure } from "./structureCache";
import { downloadStructureFile } from "../services/molecularStorageService";

const FIXTURE_IDS = new Set(["1CRN", "4HHB"]);
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

export class StructureGatewayError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "StructureGatewayError";
  }
}

export type StructureFormat = "cif" | "pdb";

export function detectStructureFormat(data: string): StructureFormat {
  const head = data.slice(0, 2000).trim();
  if (head.startsWith("data_") || head.includes("loop_") || head.includes("_atom_site")) {
    return "cif";
  }
  return "pdb";
}

export interface StructurePayload {
  id: string;
  source: "fixture" | "rcsb" | "custom" | "alphafold";
  format: StructureFormat;
  data: string;
}

export function normalizePdbId(input: unknown): string {
  if (typeof input !== "string") {
    throw new StructureGatewayError("INVALID_INPUT", "Structure ID must be a string.", false);
  }
  const id = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$|^AF-[A-Z0-9_-]+$|^[A-Z0-9]{6,10}$/.test(id)) {
    throw new StructureGatewayError(
      "INVALID_INPUT",
      "Use a four-character PDB ID (e.g. 1CRN) or AlphaFold/UniProt identifier (e.g. AF-P04637-F1 or P04637).",
      false,
    );
  }
  return id;
}

async function fetchTextWithLimits(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new StructureGatewayError(
        "FETCH_FAILED",
        response.status === 404
          ? "That structure was not found in the PDB archive."
          : `Structure download failed with HTTP ${response.status}.`,
        response.status >= 500,
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) {
      throw new StructureGatewayError(
        "FETCH_FAILED",
        "The structure exceeds the 10 MiB safety limit.",
        false,
      );
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      throw new StructureGatewayError(
        "FETCH_FAILED",
        "The structure exceeds the 10 MiB safety limit.",
        false,
      );
    }
    return new TextDecoder().decode(buffer);
  } catch (error) {
    if (error instanceof StructureGatewayError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) {
        throw new StructureGatewayError("CANCELLED", "Structure loading was cancelled.", true);
      }
      throw new StructureGatewayError("FETCH_FAILED", "Structure loading timed out.", true);
    }
    throw new StructureGatewayError(
      "FETCH_FAILED",
      "Could not reach the RCSB structure service.",
      true,
    );
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export const structureGateway = {
  async load(rawId: unknown, signal?: AbortSignal): Promise<StructurePayload> {
    const id = normalizePdbId(rawId);
    if (FIXTURE_IDS.has(id)) {
      const data = await fetchTextWithLimits(
        `${import.meta.env.BASE_URL}structures/${id}.cif`,
        signal,
      );
      return { id, source: "fixture", format: "cif", data };
    }

    // Check local IndexedDB / memory cache first
    const cached = await getCachedStructure(id);
    if (cached) {
      const format = detectStructureFormat(cached);
      return { id, source: FIXTURE_IDS.has(id) ? "fixture" : id.startsWith("AF-") || id.length > 4 ? "alphafold" : "custom", format, data: cached };
    }

    // Check Supabase Cloud Storage for user-uploaded custom structures
    const cloudDownloaded = await downloadStructureFile(id);
    if (cloudDownloaded) {
      const format = detectStructureFormat(cloudDownloaded);
      return { id, source: "custom", format, data: cloudDownloaded };
    }

    // Handle AlphaFold DB predictions (e.g. AF-P04637-F1 or UniProt accession P04637)
    if (id.startsWith("AF-") || id.length > 4) {
      const uniprotId = id.startsWith("AF-") ? id.split("-")[1] : id;
      try {
        const metadataResponse = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`, { signal });
        if (metadataResponse.ok) {
          const list = (await metadataResponse.json()) as Array<{ cifUrl?: string; pdbUrl?: string }>;
          const entry = list[0];
          const downloadUrl = entry?.cifUrl || entry?.pdbUrl;
          if (downloadUrl) {
            const data = await fetchTextWithLimits(downloadUrl, signal);
            void setCachedStructure(id, data);
            return { id, source: "alphafold", format: detectStructureFormat(data), data };
          }
        }
      } catch (err) {
        if (err instanceof StructureGatewayError) throw err;
      }
      throw new StructureGatewayError(
        "FETCH_FAILED",
        `AlphaFold 3D structure for ${id} was not found in AlphaFold DB.`,
        false,
      );
    }

    const data = await fetchTextWithLimits(
      `https://files.rcsb.org/download/${id}.cif`,
      signal,
    );
    void setCachedStructure(id, data);
    return { id, source: "rcsb", format: "cif", data };
  },
};
