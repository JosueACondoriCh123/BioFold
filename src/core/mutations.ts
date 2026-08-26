import type { MutationHeuristic } from "../types/domain";

interface AminoAcidProfile {
  code: string;
  charge: "positive" | "negative" | "neutral";
  size: "small" | "medium" | "large";
  hydrophobicity: "hydrophobic" | "polar";
}

const PROFILES: Record<string, AminoAcidProfile> = {
  A: { code: "A", charge: "neutral", size: "small", hydrophobicity: "hydrophobic" },
  R: { code: "R", charge: "positive", size: "large", hydrophobicity: "polar" },
  N: { code: "N", charge: "neutral", size: "medium", hydrophobicity: "polar" },
  D: { code: "D", charge: "negative", size: "medium", hydrophobicity: "polar" },
  C: { code: "C", charge: "neutral", size: "small", hydrophobicity: "hydrophobic" },
  Q: { code: "Q", charge: "neutral", size: "large", hydrophobicity: "polar" },
  E: { code: "E", charge: "negative", size: "large", hydrophobicity: "polar" },
  G: { code: "G", charge: "neutral", size: "small", hydrophobicity: "polar" },
  H: { code: "H", charge: "positive", size: "large", hydrophobicity: "polar" },
  I: { code: "I", charge: "neutral", size: "large", hydrophobicity: "hydrophobic" },
  L: { code: "L", charge: "neutral", size: "large", hydrophobicity: "hydrophobic" },
  K: { code: "K", charge: "positive", size: "large", hydrophobicity: "polar" },
  M: { code: "M", charge: "neutral", size: "large", hydrophobicity: "hydrophobic" },
  F: { code: "F", charge: "neutral", size: "large", hydrophobicity: "hydrophobic" },
  P: { code: "P", charge: "neutral", size: "medium", hydrophobicity: "hydrophobic" },
  S: { code: "S", charge: "neutral", size: "small", hydrophobicity: "polar" },
  T: { code: "T", charge: "neutral", size: "medium", hydrophobicity: "polar" },
  W: { code: "W", charge: "neutral", size: "large", hydrophobicity: "hydrophobic" },
  Y: { code: "Y", charge: "neutral", size: "large", hydrophobicity: "polar" },
  V: { code: "V", charge: "neutral", size: "medium", hydrophobicity: "hydrophobic" },
};

const THREE_TO_ONE: Record<string, string> = {
  ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
  GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
  PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
};

export const AMINO_ACID_CODES = Object.keys(PROFILES);

export function toOneLetterCode(residueName: string): string | undefined {
  const normalized = residueName.toUpperCase();
  return normalized.length === 1 ? PROFILES[normalized]?.code : THREE_TO_ONE[normalized];
}

export function compareAminoAcids(
  originalCode: string,
  targetCode: string,
): MutationHeuristic[] {
  const original = PROFILES[originalCode.toUpperCase()];
  const target = PROFILES[targetCode.toUpperCase()];
  if (!original || !target) return [];

  return [
    {
      dimension: "charge",
      from: original.charge,
      to: target.charge,
      changed: original.charge !== target.charge,
      note:
        original.charge === target.charge
          ? "No coarse charge-class change."
          : "Charge-class changes may alter local electrostatic interactions.",
    },
    {
      dimension: "size",
      from: original.size,
      to: target.size,
      changed: original.size !== target.size,
      note:
        original.size === target.size
          ? "Side-chain size class is similar."
          : "A size-class change may affect local packing.",
    },
    {
      dimension: "hydrophobicity",
      from: original.hydrophobicity,
      to: target.hydrophobicity,
      changed: original.hydrophobicity !== target.hydrophobicity,
      note:
        original.hydrophobicity === target.hydrophobicity
          ? "Hydrophobicity class is unchanged."
          : "A polarity change may affect solvent or core preference.",
    },
  ];
}
