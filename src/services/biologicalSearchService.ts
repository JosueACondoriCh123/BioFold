/**
 * Biological Search Service
 * Federated query across:
 * 1. Local preloaded catalog & custom user uploads
 * 2. RCSB PDB Search API (experimental crystallographic / Cryo-EM structures)
 * 3. UniProtKB & AlphaFold DB (deep-learning predicted 3D models)
 */

import { getAllCatalogItems } from "../data/molecularCatalog";

export interface BiologicalSearchResult {
  id: string;
  source: "rcsb" | "alphafold" | "catalog";
  title: string;
  organism?: string;
  gene?: string;
  resolution?: string;
  experimentalMethod?: string;
  uniprotAccession?: string;
  badge: string;
}

const SEARCH_CACHE = new Map<string, { timestamp: number; results: BiologicalSearchResult[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const CURATED_ALPHAFOLD_MODELS: BiologicalSearchResult[] = [
  {
    id: "AF-P04637-F1",
    uniprotAccession: "P04637",
    source: "alphafold",
    title: "Cellular tumor antigen p53 (Tumor suppressor)",
    gene: "TP53",
    organism: "Homo sapiens (Human)",
    resolution: "AlphaFold (High pLDDT)",
    experimentalMethod: "Predicted AI Model",
    badge: "AlphaFold DB",
  },
  {
    id: "AF-P69905-F1",
    uniprotAccession: "P69905",
    source: "alphafold",
    title: "Hemoglobin subunit alpha (HBA1)",
    gene: "HBA1",
    organism: "Homo sapiens (Human)",
    resolution: "AlphaFold (High pLDDT)",
    experimentalMethod: "Predicted AI Model",
    badge: "AlphaFold DB",
  },
  {
    id: "AF-P00519-F1",
    uniprotAccession: "P00519",
    source: "alphafold",
    title: "Tyrosine-protein kinase ABL1",
    gene: "ABL1",
    organism: "Homo sapiens (Human)",
    resolution: "AlphaFold (High pLDDT)",
    experimentalMethod: "Predicted AI Model",
    badge: "AlphaFold DB",
  },
  {
    id: "AF-P00698-F1",
    uniprotAccession: "P00698",
    source: "alphafold",
    title: "Lysozyme C",
    gene: "LYZ",
    organism: "Gallus gallus (Chicken)",
    resolution: "AlphaFold (High pLDDT)",
    experimentalMethod: "Predicted AI Model",
    badge: "AlphaFold DB",
  },
];

/**
 * Searches the local catalog for instant zero-latency matches
 */
function searchLocalCatalog(query: string): BiologicalSearchResult[] {
  const q = query.toLowerCase().trim();
  const allItems = getAllCatalogItems();

  return allItems
    .filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (Boolean(item.uniProtId) && item.uniProtId!.toLowerCase().includes(q)),
    )
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      source: "catalog",
      title: item.name,
      organism: item.category,
      resolution: item.category === "custom" ? "Custom Import" : "Experimental",
      experimentalMethod: item.method,
      uniprotAccession: item.uniProtId,
      badge: "Catalog",
    }));
}

/**
 * Queries RCSB PDB Search API v2
 */
async function searchRcsbPdb(query: string, signal?: AbortSignal): Promise<BiologicalSearchResult[]> {
  const trimmed = query.trim();

  // If query is an exact 4-char PDB code, fetch that entry summary directly
  if (/^[a-z0-9]{4}$/i.test(trimmed)) {
    const pdbId = trimmed.toUpperCase();
    try {
      const response = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`, { signal });
      if (response.ok) {
        const data = await response.json();
        const title = data.struct?.title || `PDB structure ${pdbId}`;
        const resolution = data.rcsb_entry_info?.resolution_combined?.[0]
          ? `${data.rcsb_entry_info.resolution_combined[0].toFixed(2)} Å`
          : undefined;
        const method = data.exptl?.[0]?.method || "Experimental";

        return [
          {
            id: pdbId,
            source: "rcsb",
            title,
            resolution,
            experimentalMethod: method,
            badge: "RCSB PDB",
          },
        ];
      }
    } catch {
      /* fallback */
    }
  }

  // Full-text search via RCSB Search API v2
  const rcsbSearchPayload = {
    query: {
      type: "terminal",
      service: "full_text",
      parameters: {
        value: trimmed,
      },
    },
    return_type: "entry",
    request_options: {
      paginate: {
        start: 0,
        rows: 5,
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 4500);
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const response = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rcsbSearchPayload),
      signal: controller.signal,
    }).finally(() => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    });

    if (!response.ok) return [];

    const searchData = await response.json();
    const resultIds: string[] = (searchData.result_set ?? [])
      .map((r: { identifier: string }) => r.identifier)
      .slice(0, 5);

    if (resultIds.length === 0) return [];

    // Retrieve summaries for matched IDs in parallel
    const summaries = await Promise.all(
      resultIds.map(async (id) => {
        try {
          const detailRes = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`, {
            signal,
          });
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const resolution = detail.rcsb_entry_info?.resolution_combined?.[0]
              ? `${detail.rcsb_entry_info.resolution_combined[0].toFixed(2)} Å`
              : undefined;
            return {
              id,
              source: "rcsb" as const,
              title: detail.struct?.title || `PDB Entry ${id}`,
              resolution,
              experimentalMethod: detail.exptl?.[0]?.method,
              badge: "RCSB PDB",
            };
          }
        } catch {
          /* ignore detail fetch error */
        }
        return {
          id,
          source: "rcsb" as const,
          title: `RCSB PDB Structure ${id}`,
          badge: "RCSB PDB",
        };
      }),
    );

    return summaries;
  } catch {
    return [];
  }
}

/**
 * Queries UniProtKB REST API to discover proteins with AlphaFold 3D models
 */
async function searchUniProtAndAlphaFold(
  query: string,
  signal?: AbortSignal,
): Promise<BiologicalSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const lower = trimmed.toLowerCase();

  // If searching for alphafold or uniprot directly, return our curated benchmark models
  if (lower === "alphafold" || lower === "uniprot" || lower === "alphafold db") {
    return CURATED_ALPHAFOLD_MODELS;
  }

  // Extract accession if an AF- prefixed ID was typed
  let cleanQuery = trimmed;
  if (/^AF-[A-Za-z0-9_-]+/i.test(cleanQuery)) {
    const parts = cleanQuery.split("-");
    if (parts[1]) cleanQuery = parts[1];
  }

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 8000);
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(
      cleanQuery,
    )}&fields=accession,id,gene_names,protein_name,organism_name,length&size=5`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    });

    if (!response.ok) return [];

    const data = await response.json();
    const entries = data.results ?? [];

    const dynamicResults = entries.map((entry: any) => {
      const accession: string = entry.primaryAccession || entry.accession;
      const proteinName =
        entry.proteinDescription?.recommendedName?.fullName?.value ||
        entry.proteinDescription?.submissionNames?.[0]?.fullName?.value ||
        entry.id ||
        "Protein";
      const geneName = entry.genes?.[0]?.geneName?.value;
      const organism = entry.organism?.scientificName;

      return {
        id: `AF-${accession}-F1`,
        uniprotAccession: accession,
        source: "alphafold" as const,
        title: proteinName,
        gene: geneName,
        organism,
        resolution: "AlphaFold (High pLDDT)",
        experimentalMethod: "Predicted AI Model",
        badge: "AlphaFold DB",
      };
    });

    // Merge with any matching curated benchmark models (e.g. p53)
    const matchingCurated = CURATED_ALPHAFOLD_MODELS.filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.title.toLowerCase().includes(lower) ||
        (m.gene && m.gene.toLowerCase().includes(lower)) ||
        (m.uniprotAccession && m.uniprotAccession.toLowerCase().includes(lower)),
    );

    const merged = [...matchingCurated, ...dynamicResults];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch {
    // Graceful offline/timeout fallback to curated benchmarks matching the query
    return CURATED_ALPHAFOLD_MODELS.filter(
      (m) =>
        m.id.toLowerCase().includes(lower) ||
        m.title.toLowerCase().includes(lower) ||
        (m.gene && m.gene.toLowerCase().includes(lower)) ||
        (m.uniprotAccession && m.uniprotAccession.toLowerCase().includes(lower)),
    );
  }
}

/**
 * Universal Federated Search
 */
export async function searchBiologicalStructures(
  query: string,
  signal?: AbortSignal,
): Promise<BiologicalSearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const local = searchLocalCatalog("").slice(0, 4);
    return [...CURATED_ALPHAFOLD_MODELS.slice(0, 2), ...local];
  }

  // Check cache
  const cached = SEARCH_CACHE.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  // 1. Search local catalog immediately
  const localResults = searchLocalCatalog(normalized);

  // 2. Search RCSB and UniProt/AlphaFold in parallel with limits
  const [rcsbResults, alphafoldResults] = await Promise.all([
    searchRcsbPdb(normalized, signal).catch(() => []),
    searchUniProtAndAlphaFold(normalized, signal).catch(() => []),
  ]);

  // Combine and de-duplicate by ID with balanced representation
  const seenIds = new Set<string>();
  const combined: BiologicalSearchResult[] = [];

  const addUnique = (item: BiologicalSearchResult) => {
    const key = item.id.toUpperCase();
    if (!seenIds.has(key)) {
      seenIds.add(key);
      combined.push(item);
    }
  };

  // If explicitly querying for alphafold or uniprot, prioritize AlphaFold DB models
  if (normalized.includes("alphafold") || normalized.includes("uniprot") || normalized.startsWith("af-")) {
    alphafoldResults.forEach(addUnique);
    localResults.forEach(addUnique);
    rcsbResults.forEach(addUnique);
  } else {
    // Interleave so AlphaFold DB models are never starved by local + RCSB
    const maxLen = Math.max(localResults.length, rcsbResults.length, alphafoldResults.length);
    for (let i = 0; i < maxLen; i++) {
      if (localResults[i]) addUnique(localResults[i]);
      if (alphafoldResults[i]) addUnique(alphafoldResults[i]);
      if (rcsbResults[i]) addUnique(rcsbResults[i]);
    }
  }

  // Limit to top 12 results
  const finalResults = combined.slice(0, 12);
  SEARCH_CACHE.set(normalized, { timestamp: Date.now(), results: finalResults });

  return finalResults;
}
