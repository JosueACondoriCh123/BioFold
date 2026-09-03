import { describe, expect, it } from "vitest";
import {
  CATALOG_CATEGORIES,
  MOLECULAR_CATALOG,
  filterCatalog,
  getCatalogItem,
  type MolecularCategory,
} from "../src/data/molecularCatalog";

describe("Molecular Catalog (Phase 2.4 - 50+ Structures)", () => {
  it("contains at least 50 high-quality curated biomolecules", () => {
    expect(MOLECULAR_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it("ensures every molecule has a valid RFC-compliant 4-character PDB ID without duplicates", () => {
    const idSet = new Set<string>();

    for (const item of MOLECULAR_CATALOG) {
      expect(item.id).toMatch(/^[A-Z0-9]{4}$/);
      expect(idSet.has(item.id)).toBe(false);
      idSet.add(item.id);
    }

    expect(idSet.size).toBe(MOLECULAR_CATALOG.length);
  });

  it("verifies required fields, valid resolution, and known categories for each entry", () => {
    const validCategories: MolecularCategory[] = [
      "enzymes",
      "viral",
      "oncology",
      "membrane",
      "immunology",
      "nucleic",
    ];

    for (const item of MOLECULAR_CATALOG) {
      expect(item.name.trim().length).toBeGreaterThan(2);
      expect(item.organism.trim().length).toBeGreaterThan(2);
      expect(item.description.trim().length).toBeGreaterThan(10);
      expect(validCategories).toContain(item.category);
      expect(item.resolution).toBeGreaterThan(0);
      expect(item.resolution).toBeLessThan(10);
      expect(["X-ray", "Cryo-EM", "NMR", "Synthetic"]).toContain(item.method);
    }
  });

  it("ensures all 6 biological categories have multiple representative structures", () => {
    for (const cat of CATALOG_CATEGORIES.filter((c) => c.id !== "custom")) {
      const items = MOLECULAR_CATALOG.filter((m) => m.category === cat.id);
      expect(items.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("retrieves a molecule by PDB ID case-insensitively", () => {
    const item1 = getCatalogItem("1crn");
    expect(item1).toBeDefined();
    expect(item1?.name).toBe("Crambin");

    const item2 = getCatalogItem("6LU7");
    expect(item2).toBeDefined();
    expect(item2?.name).toContain("SARS-CoV-2 Main Protease");

    const nonExistent = getCatalogItem("XXXX");
    expect(nonExistent).toBeUndefined();
  });

  it("filters molecules by category and textual query", () => {
    // Filter by category
    const viral = filterCatalog({ category: "viral" });
    expect(viral.length).toBeGreaterThanOrEqual(10);
    expect(viral.every((m) => m.category === "viral")).toBe(true);

    // Filter by query (name)
    const kras = filterCatalog({ query: "KRAS" });
    expect(kras.length).toBeGreaterThanOrEqual(2);
    expect(kras.some((m) => m.id === "4HJO")).toBe(true);
    expect(kras.some((m) => m.id === "6OIM")).toBe(true);

    // Filter by UniProt ID
    const p01116 = filterCatalog({ query: "P01116" });
    expect(p01116.length).toBeGreaterThanOrEqual(2);

    // Combined category and query
    const oncologyKras = filterCatalog({ category: "oncology", query: "sotorasib" });
    expect(oncologyKras).toHaveLength(1);
    expect(oncologyKras[0].id).toBe("6OIM");

    // All category with empty query returns everything
    const all = filterCatalog({ category: "all", query: "" });
    expect(all).toHaveLength(MOLECULAR_CATALOG.length);
  });
});
