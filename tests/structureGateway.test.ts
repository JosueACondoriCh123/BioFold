import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StructureGatewayError,
  normalizePdbId,
  structureGateway,
} from "../src/adapters/structureGateway";

afterEach(() => vi.restoreAllMocks());

describe("structure gateway", () => {
  it("normalizes valid PDB IDs and rejects invalid values", () => {
    expect(normalizePdbId(" 1crn ")).toBe("1CRN");
    expect(() => normalizePdbId("ABC")).toThrow(StructureGatewayError);
  });

  it.each(["1CRN", "4HHB"])(
    "uses the local deterministic fixture for %s",
    async (pdbId) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("data_fixture", { status: 200 }),
      );

      const result = await structureGateway.load(pdbId.toLowerCase());

      expect(result).toMatchObject({ id: pdbId, source: "fixture", format: "cif" });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toContain(`structures/${pdbId}.cif`);
      expect(String(fetchMock.mock.calls[0][0])).not.toContain("files.rcsb.org");
    },
  );

  it("uses RCSB for other identifiers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data_remote", { status: 200 }),
    );
    const result = await structureGateway.load("7TIM");
    expect(result.source).toBe("rcsb");
    expect(fetchMock.mock.calls[0][0]).toBe("https://files.rcsb.org/download/7TIM.cif");
  });

  it("detects CIF vs PDB formats accurately", async () => {
    const { detectStructureFormat } = await import("../src/adapters/structureGateway");
    expect(detectStructureFormat("data_1CRN\n#\nloop_\n_atom_site.group_PDB")).toBe("cif");
    expect(detectStructureFormat("HEADER    PLANT SEED PROTEIN                      30-APR-81   1CRN\nATOM      1  N   THR A   1")).toBe("pdb");
  });
});
