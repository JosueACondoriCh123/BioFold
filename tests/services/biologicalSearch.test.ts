import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchBiologicalStructures } from "../../src/services/biologicalSearchService";

describe("BiologicalSearchService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("finds structures from the local catalog immediately", async () => {
    const results = await searchBiologicalStructures("crambin");
    expect(results.length).toBeGreaterThan(0);
    const crambin = results.find((r) => r.id === "1CRN");
    expect(crambin).toBeDefined();
    expect(crambin?.title.toLowerCase()).toContain("crambin");
    expect(crambin?.source).toBe("catalog");
    expect(crambin?.badge).toBe("Catalog");
  });

  it("handles empty query by returning default catalog items", async () => {
    const results = await searchBiologicalStructures("");
    expect(results.length).toBeGreaterThan(0);
  });

  it("merges mocked RCSB search results when external API responds", async () => {
    const mockRcsbSearch = {
      result_set: [{ identifier: "7C22" }],
    };
    const mockRcsbDetail = {
      struct: { title: "SARS-CoV-2 Spike protein" },
      rcsb_entry_info: { resolution_combined: [2.5] },
      exptl: [{ method: "ELECTRON MICROSCOPY" }],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("search.rcsb.org")) {
        return new Response(JSON.stringify(mockRcsbSearch), { status: 200 });
      }
      if (urlStr.includes("data.rcsb.org/rest/v1/core/entry/7C22")) {
        return new Response(JSON.stringify(mockRcsbDetail), { status: 200 });
      }
      if (urlStr.includes("rest.uniprot.org")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const results = await searchBiologicalStructures("spike");
    const rcsbItem = results.find((r) => r.id === "7C22");
    expect(rcsbItem).toBeDefined();
    expect(rcsbItem?.title).toBe("SARS-CoV-2 Spike protein");
    expect(rcsbItem?.badge).toBe("RCSB PDB");
    expect(rcsbItem?.resolution).toBe("2.50 Å");

    fetchSpy.mockRestore();
  });

  it("gracefully falls back to local catalog when external search throws network errors", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network offline"));

    const results = await searchBiologicalStructures("hemoglobin");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === "4HHB")).toBe(true);

    fetchSpy.mockRestore();
  });

  it("finds structures by UniProt ID from the catalog", async () => {
    const results = await searchBiologicalStructures("P01542");
    expect(results.length).toBeGreaterThan(0);
    const crambin = results.find((r) => r.id === "1CRN");
    expect(crambin).toBeDefined();
    expect(crambin?.title.toLowerCase()).toContain("crambin");
  });

  it("returns AlphaFold DB models when querying 'alphafold'", async () => {
    const results = await searchBiologicalStructures("alphafold");
    expect(results.length).toBeGreaterThan(0);
    const afModel = results.find((r) => r.source === "alphafold");
    expect(afModel).toBeDefined();
    expect(afModel?.badge).toBe("AlphaFold DB");
    expect(afModel?.id.startsWith("AF-")).toBe(true);
  });

  it("normalizes AF- prefixed query to discover the AlphaFold model", async () => {
    const results = await searchBiologicalStructures("AF-P04637-F1");
    expect(results.length).toBeGreaterThan(0);
    const p53 = results.find((r) => r.id === "AF-P04637-F1" || r.uniprotAccession === "P04637");
    expect(p53).toBeDefined();
    expect(p53?.badge).toBe("AlphaFold DB");
  });
});
