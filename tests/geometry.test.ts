import { describe, expect, it } from "vitest";
import {
  findNeighborResidues,
  measureAtomDistance,
  summarizeAtoms,
} from "../src/core/geometry";
import type { AtomRecord } from "../src/types/domain";

const atom = (overrides: Partial<AtomRecord>): AtomRecord => ({
  serial: 1,
  atomName: "CA",
  element: "C",
  chain: "A",
  residueNumber: 1,
  residueName: "ALA",
  x: 0,
  y: 0,
  z: 0,
  hetero: false,
  ...overrides,
});

describe("geometry domain", () => {
  it("summarizes polymer residues, ligands, water, chains, and atoms", () => {
    const atoms = [
      atom({ serial: 1 }),
      atom({ serial: 2, atomName: "N" }),
      atom({ serial: 3, chain: "B", residueNumber: 2, residueName: "GLY" }),
      atom({ serial: 4, chain: "B", residueNumber: 90, residueName: "HEM", hetero: true }),
      atom({ serial: 5, chain: "B", residueNumber: 91, residueName: "HOH", hetero: true }),
    ];

    expect(summarizeAtoms(atoms)).toEqual({
      chains: ["A", "B"],
      chainCount: 2,
      residueCount: 2,
      atomCount: 5,
      ligandCount: 1,
      waterCount: 1,
    });
  });

  it("calculates a 3-4-5 atomic distance", () => {
    const atoms = [
      atom({ serial: 1, residueNumber: 1, x: 0, y: 0, z: 0 }),
      atom({ serial: 2, residueNumber: 2, x: 3, y: 4, z: 0 }),
    ];
    const result = measureAtomDistance(
      atoms,
      { chain: "A", residueNumber: 1, atomName: "CA" },
      { chain: "A", residueNumber: 2, atomName: "CA" },
    );
    expect(result.angstroms).toBeCloseTo(5, 2);
  });

  it("returns unique nearby residues ordered by minimum atom distance", () => {
    const atoms = [
      atom({ serial: 1, residueNumber: 10, x: 0 }),
      atom({ serial: 2, residueNumber: 11, residueName: "GLY", x: 2 }),
      atom({ serial: 3, residueNumber: 11, residueName: "GLY", atomName: "N", x: 3 }),
      atom({ serial: 4, residueNumber: 12, residueName: "SER", x: 4.5 }),
      atom({ serial: 5, residueNumber: 13, residueName: "LEU", x: 8 }),
    ];
    const neighbors = findNeighborResidues(atoms, { chain: "A", residueNumber: 10 }, 5);
    expect(neighbors.map((item) => item.residueNumber)).toEqual([11, 12]);
    expect(neighbors[0].distance).toBe(2);
  });
});
