/**
 * UniProt & ClinVar Biological Annotations Service
 * Fetches real-time catalytic active sites, disulfide bridges, and pathogenic variants
 * for any loaded macromolecule.
 */

import type {
  ActiveSiteAnnotation,
  DisulfideAnnotation,
  ClinvarVariantAnnotation,
  ProteinAnnotations,
} from "../types/domain";
import { getCatalogItem } from "../data/molecularCatalog";

// Known fallback annotations for standard demo structures
const FIXTURE_ANNOTATIONS: Record<string, ProteinAnnotations> = {
  "1CRN": {
    pdbId: "1CRN",
    uniprotAccession: "P01542",
    entryName: "CRA1_CRAAB",
    proteinName: "Crambin",
    organism: "Crambe abyssinica (Abyssinian mustard)",
    functionSummary:
      "Plant seed storage protein and small amphipathic plant defensin-like polypeptide. Stabilized by three conserved intramolecular disulfide bonds.",
    activeSites: [
      {
        type: "binding_site",
        chain: "A",
        residueNumber: 13,
        aminoAcid: "Phe",
        description: "Hydrophobic core stabilization cluster",
      },
    ],
    disulfideBonds: [
      { chain: "A", residue1: 3, residue2: 40, description: "Cys3 - Cys40 disulfide bridge" },
      { chain: "A", residue1: 4, residue2: 32, description: "Cys4 - Cys32 disulfide bridge" },
      { chain: "A", residue1: 16, residue2: 26, description: "Cys16 - Cys26 disulfide bridge" },
    ],
    variants: [],
  },
  "6LU7": {
    pdbId: "6LU7",
    uniprotAccession: "P0DTD1",
    entryName: "R1AB_SARS2",
    proteinName: "3C-like proteinase (Main Protease, Mpro)",
    geneName: "rep",
    organism: "Severe acute respiratory syndrome coronavirus 2 (SARS-CoV-2)",
    functionSummary:
      "Cleaves the C-terminus of replicase polyprotein at 11 conserved sites. Operates through a catalytic dyad (Cys145 - His41).",
    activeSites: [
      {
        type: "active_site",
        chain: "A",
        residueNumber: 41,
        aminoAcid: "His",
        description: "Catalytic Dyad General Base (His41)",
      },
      {
        type: "active_site",
        chain: "A",
        residueNumber: 145,
        aminoAcid: "Cys",
        description: "Catalytic Dyad Nucleophile (Cys145)",
      },
      {
        type: "binding_site",
        chain: "A",
        residueNumber: 166,
        aminoAcid: "Glu",
        description: "Substrate S1 binding pocket gatekeeper (Glu166)",
      },
    ],
    disulfideBonds: [],
    variants: [
      {
        chain: "A",
        position: 145,
        wildType: "C",
        mutant: "A",
        consequence: "Catalytic ablation / inactive mutant",
        clinicalSignificance: "Drug-resistant surveillance",
      },
    ],
  },
  "4HHB": {
    pdbId: "4HHB",
    uniprotAccession: "P69905",
    entryName: "HBA_HUMAN",
    proteinName: "Hemoglobin subunit alpha / beta",
    geneName: "HBA1 / HBB",
    organism: "Homo sapiens (Human)",
    functionSummary:
      "Involved in oxygen transport from the lung to the various peripheral tissues. Undergoes allosteric T-to-R quaternary transition upon ligand binding.",
    activeSites: [
      {
        type: "binding_site",
        chain: "A",
        residueNumber: 58,
        aminoAcid: "His",
        description: "Distal Histidine (His58) stabilizes O2 via hydrogen bond",
      },
      {
        type: "binding_site",
        chain: "A",
        residueNumber: 87,
        aminoAcid: "His",
        description: "Proximal Histidine (His87) coordinated directly to heme Fe2+",
      },
    ],
    disulfideBonds: [],
    variants: [
      {
        chain: "A",
        position: 6,
        wildType: "E",
        mutant: "V",
        consequence: "HbS polymerization (Sickle Cell Anemia)",
        clinicalSignificance: "Pathogenic",
        clinvarId: "VCV000015110",
        dbsnpId: "rs334",
      },
    ],
  },
};

const ANNOTATION_CACHE = new Map<string, { timestamp: number; data: ProteinAnnotations }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Resolves UniProt Accession for a given PDB or AlphaFold ID
 */
async function resolveUniprotAccession(id: string, signal?: AbortSignal): Promise<string | null> {
  const norm = id.trim().toUpperCase();

  // If already an AlphaFold ID, extract accession
  if (norm.startsWith("AF-")) {
    const parts = norm.split("-");
    if (parts[1]) return parts[1];
  }

  // If it matches UniProt accession format directly
  if (/^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/i.test(norm)) {
    return norm;
  }

  // If present in catalog with pre-resolved UniProt accession, return immediately
  const catalogItem = getCatalogItem(norm);
  if (catalogItem?.uniProtId) {
    return catalogItem.uniProtId;
  }

  // If it's a 4-char PDB code, query RCSB polymer entity to get cross-referenced UniProt accession
  if (/^[A-Z0-9]{4}$/.test(norm)) {
    try {
      const res = await fetch(`https://data.rcsb.org/rest/v1/core/polymer_entity/${norm}/1`, {
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        const ids = json.rcsb_polymer_entity_container_identifiers?.reference_sequence_identifiers;
        const uniprotRef = ids?.find((ref: { database_name: string }) => ref.database_name === "UniProt");
        if (uniprotRef?.database_accession) {
          return uniprotRef.database_accession;
        }
      }
    } catch {
      /* fallback */
    }

    // Secondary fallback: search UniProt by PDB xref
    try {
      const uRes = await fetch(
        `https://rest.uniprot.org/uniprotkb/search?query=xref:pdb-${norm}&size=1&fields=accession`,
        { signal },
      );
      if (uRes.ok) {
        const uJson = await uRes.json();
        const acc = uJson.results?.[0]?.primaryAccession;
        if (acc) return acc;
      }
    } catch {
      /* fallback */
    }
  }

  return null;
}

/**
 * Parses raw UniProt features into structured active sites, disulfides, and variants
 */
function parseUniProtFeatures(features: any[] = [], defaultChain = "A") {
  const activeSites: ActiveSiteAnnotation[] = [];
  const disulfideBonds: DisulfideAnnotation[] = [];
  const variants: ClinvarVariantAnnotation[] = [];

  for (const feat of features) {
    const type = feat.type;
    const start = feat.location?.start?.value;
    const end = feat.location?.end?.value;
    const desc = feat.description || "";

    if (type === "Active site" || type === "Binding site") {
      if (start) {
        activeSites.push({
          type: type === "Active site" ? "active_site" : "binding_site",
          chain: defaultChain,
          residueNumber: start,
          description: desc || (type === "Active site" ? "Catalytic site" : "Ligand binding residue"),
        });
      }
    } else if (type === "Disulfide bond") {
      if (start && end && start !== end) {
        disulfideBonds.push({
          chain: defaultChain,
          residue1: start,
          residue2: end,
          description: desc || `Disulfide bridge (Cys${start} - Cys${end})`,
        });
      }
    } else if (type === "Natural variant") {
      const origSeq = feat.alternativeSequence?.originalSequence;
      const altSeqs = feat.alternativeSequence?.alternativeSequences || [];
      const mutant = altSeqs[0] || "?";
      const isPathogenic = /pathogenic|disease|loss of function|syndrome|carcinoma|defect/i.test(desc);

      if (start && origSeq) {
        variants.push({
          chain: defaultChain,
          position: start,
          wildType: origSeq,
          mutant,
          consequence: desc || "Natural variant",
          clinicalSignificance: isPathogenic ? "Pathogenic" : "Variant of uncertain significance",
          dbsnpId: feat.featureCrossReferences?.find((xr: any) => xr.database === "dbSNP")?.id,
        });
      }
    }
  }

  return { activeSites, disulfideBonds, variants };
}

/**
 * Retrieves comprehensive biological annotations for a protein structure
 */
export async function getBiologicalAnnotations(
  pdbId: string,
  signal?: AbortSignal,
): Promise<ProteinAnnotations> {
  if (signal?.aborted) throw new DOMException("Annotation query cancelled.", "AbortError");
  const normalizedId = pdbId.trim().toUpperCase();

  // 1. Check in-memory cache
  const cached = ANNOTATION_CACHE.get(normalizedId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Check fixture fallbacks
  if (FIXTURE_ANNOTATIONS[normalizedId]) {
    return { ...FIXTURE_ANNOTATIONS[normalizedId], retrieval: { status: "available", source: "fixture" } };
  }

  try {
    // 3. Resolve UniProt Accession
    const accession = await resolveUniprotAccession(normalizedId, signal);
    if (!accession) {
      throw new Error(`No UniProt accession found for ${normalizedId}`);
    }

    // 4. Fetch UniProt entry JSON
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 6000);
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const response = await fetch(`https://rest.uniprot.org/uniprotkb/${accession}.json`, {
      signal: controller.signal,
    }).finally(() => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    });

    if (!response.ok) {
      throw new Error(`UniProt returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const proteinName =
      data.proteinDescription?.recommendedName?.fullName?.value ||
      data.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
      data.uniProtkbId ||
      normalizedId;
    const geneName = data.genes?.[0]?.geneName?.value;
    const organism = data.organism?.scientificName || "Unknown organism";
    const functionSummary = data.comments?.find((c: any) => c.commentType === "FUNCTION")?.texts?.[0]?.value;

    const { activeSites, disulfideBonds, variants } = parseUniProtFeatures(data.features, "A");

    const annotations: ProteinAnnotations = {
      retrieval: { status: "available", source: "uniprot" },
      pdbId: normalizedId,
      uniprotAccession: accession,
      entryName: data.uniProtkbId,
      proteinName,
      geneName,
      organism,
      functionSummary,
      activeSites: activeSites.slice(0, 12),
      disulfideBonds: disulfideBonds.slice(0, 10),
      variants: variants.slice(0, 15),
    };

    ANNOTATION_CACHE.set(normalizedId, { timestamp: Date.now(), data: annotations });
    return annotations;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Annotation query cancelled.", "AbortError");
    // Keep the human panel usable, while letting commands distinguish a failed
    // retrieval from a successful query that genuinely contains no features.
    const fallback: ProteinAnnotations = {
      retrieval: {
        status: "unavailable", source: "uniprot",
        message: `Could not retrieve UniProt annotations for ${normalizedId}: ${error instanceof Error ? error.message : "request failed"}.`,
      },
      pdbId: normalizedId,
      proteinName: `Structure ${normalizedId}`,
      organism: "Experimental macromolecule",
      activeSites: [],
      disulfideBonds: [],
      variants: [],
    };
    return fallback;
  }
}
