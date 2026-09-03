import { describe, expect, it, beforeEach } from "vitest";
import {
  clearStructureCache,
  getCachedStructure,
  getCachedStructureIds,
  setCachedStructure,
} from "../src/adapters/structureCache";

describe("Structure Cache (IndexedDB & in-memory fallback)", () => {
  beforeEach(async () => {
    await clearStructureCache();
  });

  it("stores and retrieves a structure by PDB ID case-insensitively", async () => {
    const mockCif = "data_6LU7\n# mock CIF content for test\n_entry.id 6LU7\n";
    await setCachedStructure("6LU7", mockCif);

    const retrieved1 = await getCachedStructure("6LU7");
    expect(retrieved1).toBe(mockCif);

    const retrieved2 = await getCachedStructure("6lu7");
    expect(retrieved2).toBe(mockCif);
  });

  it("returns null for non-cached structures", async () => {
    const result = await getCachedStructure("XXXX");
    expect(result).toBeNull();
  });

  it("lists all cached structure IDs", async () => {
    await setCachedStructure("1TIM", "cif 1TIM");
    await setCachedStructure("1EMA", "cif 1EMA");

    const ids = await getCachedStructureIds();
    expect(ids).toContain("1TIM");
    expect(ids).toContain("1EMA");
  });

  it("clears the cache successfully", async () => {
    await setCachedStructure("1LYZ", "cif 1LYZ");
    expect(await getCachedStructure("1LYZ")).not.toBeNull();

    await clearStructureCache();
    expect(await getCachedStructure("1LYZ")).toBeNull();
  });
});
