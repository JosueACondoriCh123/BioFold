import type {
  AtomRecord,
  AtomRef,
  NeighborResidue,
  ResidueRef,
  StructureSummary,
} from "../types/domain";

const WATER_NAMES = new Set(["HOH", "WAT", "DOD"]);

export class GeometryError extends Error {
  constructor(
    public readonly code: "SELECTION_NOT_FOUND" | "AMBIGUOUS_ATOM",
    message: string,
  ) {
    super(message);
    this.name = "GeometryError";
  }
}

export function residueKey(residue: ResidueRef): string {
  return `${residue.chain || "_"}:${residue.residueNumber}:${residue.insertionCode ?? ""}`;
}

export function summarizeAtoms(atoms: AtomRecord[]): StructureSummary {
  const chains = new Set<string>();
  const residues = new Set<string>();
  const ligands = new Set<string>();
  const waters = new Set<string>();

  for (const atom of atoms) {
    const chain = atom.chain || "–";
    const key = residueKey(atom);
    chains.add(chain);

    if (WATER_NAMES.has(atom.residueName.toUpperCase())) {
      waters.add(key);
    } else if (atom.hetero) {
      ligands.add(key);
    } else {
      residues.add(key);
    }
  }

  const sortedChains = [...chains].sort((a, b) => a.localeCompare(b));
  return {
    chains: sortedChains,
    chainCount: sortedChains.length,
    residueCount: residues.size,
    atomCount: atoms.length,
    ligandCount: ligands.size,
    waterCount: waters.size,
  };
}

export function findResidueAtoms(
  atoms: AtomRecord[],
  residue: ResidueRef,
): AtomRecord[] {
  return atoms.filter(
    (atom) =>
      atom.chain === residue.chain &&
      atom.residueNumber === residue.residueNumber &&
      (residue.insertionCode === undefined ||
        atom.insertionCode === residue.insertionCode),
  );
}

export function resolveAtom(atoms: AtomRecord[], ref: AtomRef): AtomRecord {
  const matches = findResidueAtoms(atoms, ref).filter(
    (atom) => atom.atomName.toUpperCase() === ref.atomName.toUpperCase(),
  );

  if (matches.length === 0) {
    throw new GeometryError(
      "SELECTION_NOT_FOUND",
      `Atom ${ref.atomName} was not found at ${ref.chain}:${ref.residueNumber}.`,
    );
  }
  if (matches.length > 1) {
    throw new GeometryError(
      "AMBIGUOUS_ATOM",
      `Atom ${ref.atomName} at ${ref.chain}:${ref.residueNumber} is ambiguous; provide an insertion code.`,
    );
  }
  return matches[0];
}

export function euclideanDistance(a: AtomRecord, b: AtomRecord): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function measureAtomDistance(
  atoms: AtomRecord[],
  from: AtomRef,
  to: AtomRef,
): { fromAtom: AtomRecord; toAtom: AtomRecord; angstroms: number } {
  const fromAtom = resolveAtom(atoms, from);
  const toAtom = resolveAtom(atoms, to);
  return {
    fromAtom,
    toAtom,
    angstroms: euclideanDistance(fromAtom, toAtom),
  };
}

export function findNeighborResidues(
  atoms: AtomRecord[],
  target: ResidueRef,
  radius = 5,
): NeighborResidue[] {
  const targetAtoms = findResidueAtoms(atoms, target);
  if (targetAtoms.length === 0) {
    throw new GeometryError(
      "SELECTION_NOT_FOUND",
      `Residue ${target.chain}:${target.residueNumber} was not found.`,
    );
  }

  const targetKey = residueKey(target);
  const nearest = new Map<string, NeighborResidue>();

  for (const atom of atoms) {
    if (WATER_NAMES.has(atom.residueName.toUpperCase())) continue;
    const candidateKey = residueKey(atom);
    if (candidateKey === targetKey) continue;

    let minDistance = Number.POSITIVE_INFINITY;
    for (const targetAtom of targetAtoms) {
      minDistance = Math.min(minDistance, euclideanDistance(targetAtom, atom));
    }

    if (minDistance <= radius) {
      const existing = nearest.get(candidateKey);
      if (!existing || minDistance < existing.distance) {
        nearest.set(candidateKey, {
          chain: atom.chain,
          residueNumber: atom.residueNumber,
          insertionCode: atom.insertionCode,
          residueName: atom.residueName,
          distance: minDistance,
        });
      }
    }
  }

  return [...nearest.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 40);
}
