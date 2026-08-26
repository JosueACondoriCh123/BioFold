import { describe, expect, it } from "vitest";
import { compareAminoAcids, toOneLetterCode } from "../src/core/mutations";

describe("mutation heuristics", () => {
  it("maps standard three-letter residue codes", () => {
    expect(toOneLetterCode("TRP")).toBe("W");
    expect(toOneLetterCode("gly")).toBe("G");
  });

  it("labels coarse physicochemical changes without predicting stability", () => {
    const result = compareAminoAcids("D", "W");
    expect(result).toHaveLength(3);
    expect(result.find((item) => item.dimension === "charge")?.changed).toBe(true);
    expect(result.find((item) => item.dimension === "hydrophobicity")?.changed).toBe(true);
    expect(result.every((item) => !item.note.toLowerCase().includes("stability"))).toBe(true);
  });
});
