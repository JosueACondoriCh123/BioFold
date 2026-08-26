import type { CommandErrorCode } from "../types/domain";

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

export interface StructurePayload {
  id: string;
  source: "fixture" | "rcsb";
  format: "cif";
  data: string;
}

export function normalizePdbId(input: unknown): string {
  if (typeof input !== "string") {
    throw new StructureGatewayError("INVALID_INPUT", "PDB ID must be a string.", false);
  }
  const id = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(id)) {
    throw new StructureGatewayError(
      "INVALID_INPUT",
      "Use a four-character PDB ID, for example 1CRN or 4HHB.",
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

    const data = await fetchTextWithLimits(
      `https://files.rcsb.org/download/${id}.cif`,
      signal,
    );
    return { id, source: "rcsb", format: "cif", data };
  },
};
