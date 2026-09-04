import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  uploadStructureFile,
  downloadStructureFile,
  deleteStructureFile,
} from "../../src/services/molecularStorageService";
import { clearStructureCache } from "../../src/adapters/structureCache";

describe("MolecularStorageService", () => {
  beforeEach(async () => {
    await clearStructureCache();
    vi.restoreAllMocks();
  });

  it("caches uploaded structure file in IndexedDB", async () => {
    const fakeCif = "data_fake\n_atom_site.id 1";
    const result = await uploadStructureFile({
      pdbId: "TEST",
      content: fakeCif,
      format: "cif",
    });

    expect(result.ok).toBe(true);
    expect(result.pdbId).toBe("TEST");

    const downloaded = await downloadStructureFile("TEST");
    expect(downloaded).toBe(fakeCif);
  });

  it("returns null when structure is not in cache or cloud", async () => {
    const downloaded = await downloadStructureFile("NONEXIST");
    expect(downloaded).toBeNull();
  });
});
