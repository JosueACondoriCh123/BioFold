import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
} from "../../src/services/bookmarkService";

describe("BookmarkService (3D Persistent Bookmarks)", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && localStorage?.clear) {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it("creates and retrieves bookmarks in offline / localStorage mode", async () => {
    const created = await createBookmark({
      pdbId: "6LU7",
      chain: "A",
      residueNumber: 145,
      note: "Catalytic cysteine nucleophile",
      color: "#5ccfb5",
    });

    expect(created.pdbId).toBe("6LU7");
    expect(created.chain).toBe("A");
    expect(created.residueNumber).toBe(145);
    expect(created.note).toBe("Catalytic cysteine nucleophile");
    expect(created.color).toBe("#5ccfb5");

    const list = await listBookmarks("6LU7");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
  });

  it("deletes a bookmark by ID", async () => {
    const b1 = await createBookmark({
      pdbId: "1CRN",
      chain: "A",
      residueNumber: 3,
      note: "Disulfide Cys3",
    });

    const b2 = await createBookmark({
      pdbId: "1CRN",
      chain: "A",
      residueNumber: 40,
      note: "Disulfide Cys40",
    });

    let list = await listBookmarks("1CRN");
    expect(list).toHaveLength(2);

    await deleteBookmark(b1.id, "1CRN");
    list = await listBookmarks("1CRN");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b2.id);
  });

  it("normalizes uppercase PDB ID and defaults chain to A", async () => {
    const b = await createBookmark({
      pdbId: "4hhb",
      chain: "",
      residueNumber: 6,
      note: "Sickle cell mutation site",
    });

    expect(b.pdbId).toBe("4HHB");
    expect(b.chain).toBe("A");
  });
});
