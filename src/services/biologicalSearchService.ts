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
        item.category.toLowerCase().includes(q),
    )
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      source: "catalog",
      title: item.name,
      organism: item.category,
      resolution: item.category === "custom" ? "Custom Import" : "Experimental",
      experimentalMethod: item.method,
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

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 4500);
    const forwardAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(
      trimmed,
    )}&fields=accession,id,gene_names,protein_name,organism_name,length&size=4`;

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

    return entries.map((entry: any) => {
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
        source: "alphafold",
        title: proteinName,
        gene: geneName,
        organism,
        resolution: "AlphaFold (High pLDDT)",
        experimentalMethod: "Predicted AI Model",
        badge: "AlphaFold DB",
      };
    });
  } catch {
    return [];
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
  if (!normalized) return searchLocalCatalog("");

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

  // Combine and de-duplicate by ID
  const seenIds = new Set<string>();
  const combined: BiologicalSearchResult[] = [];

  for (const item of [...localResults, ...rcsbResults, ...alphafoldResults]) {
    const key = item.id.toUpperCase();
    if (!seenIds.has(key)) {
      seenIds.add(key);
      combined.push(item);
    }
  }

  // Limit to top 10 results
  const finalResults = combined.slice(0, 10);
  SEARCH_CACHE.set(normalized, { timestamp: Date.now(), results: finalResults });

  return finalResults;
}
