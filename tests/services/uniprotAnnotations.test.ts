import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBiologicalAnnotations } from "../../src/services/uniprotAnnotationService";

describe("UniProt & ClinVar Biological Annotations Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns authentic catalytic dyad for SARS-CoV-2 Main Protease (6LU7)", async () => {
    const annotations = await getBiologicalAnnotations("6LU7");
    expect(annotations.pdbId).toBe("6LU7");
    expect(annotations.uniprotAccession).toBe("P0DTD1");
    expect(annotations.activeSites.length).toBeGreaterThanOrEqual(2);

    const his41 = annotations.activeSites.find((s) => s.residueNumber === 41);
    const cys145 = annotations.activeSites.find((s) => s.residueNumber === 145);

    expect(his41).toBeDefined();
    expect(his41?.aminoAcid).toBe("His");
    expect(cys145).toBeDefined();
    expect(cys145?.aminoAcid).toBe("Cys");
  });

  it("returns three conserved disulfide bonds for Crambin (1CRN)", async () => {
    const annotations = await getBiologicalAnnotations("1CRN");
    expect(annotations.pdbId).toBe("1CRN");
    expect(annotations.disulfideBonds).toHaveLength(3);
    expect(annotations.disulfideBonds[0]).toEqual({
      chain: "A",
      residue1: 3,
      residue2: 40,
      description: "Cys3 - Cys40 disulfide bridge",
    });
  });

  it("returns pathogenic sickle cell mutation for Hemoglobin (4HHB)", async () => {
    const annotations = await getBiologicalAnnotations("4HHB");
    expect(annotations.pdbId).toBe("4HHB");
    expect(annotations.variants.length).toBeGreaterThan(0);

    const hbs = annotations.variants.find((v) => v.position === 6 && v.mutant === "V");
    expect(hbs).toBeDefined();
    expect(hbs?.clinicalSignificance).toBe("Pathogenic");
    expect(hbs?.clinvarId).toBe("VCV000015110");
  });

  it("gracefully falls back when an unknown structure has no annotations", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("UniProt 404"));

    const annotations = await getBiologicalAnnotations("9ZZZ");
    expect(annotations.pdbId).toBe("9ZZZ");
    expect(annotations.activeSites).toEqual([]);
    expect(annotations.variants).toEqual([]);
    expect(annotations.retrieval).toMatchObject({ status: "unavailable", source: "uniprot" });
  });

  it("distinguishes a successful entry with no features from a failed retrieval", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      primaryAccession: "Q9ZZZ1", proteinDescription: { recommendedName: { fullName: { value: "Test protein" } } },
      organism: { scientificName: "Test organism" }, features: [],
    }), { status: 200 }));
    const annotations = await getBiologicalAnnotations("Q9ZZZ1");
    expect(annotations.activeSites).toEqual([]);
    expect(annotations.retrieval).toEqual({ status: "available", source: "uniprot" });
  });

  it("does not report a cancelled request as empty annotation data", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(getBiologicalAnnotations("Q9ZZZ2", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
