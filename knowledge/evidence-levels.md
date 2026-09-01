# Scientific evidence levels in BioFold

BioFold separates statements by how they were produced. This distinction must remain visible in the laboratory, persisted project events, citations, and assistant responses.

## Observed

Observed information comes directly from the loaded structural record: atomic coordinates, chain identifiers, residue identifiers, atom names, ligands, and waters. Observed does not mean that every biological interpretation is proven; it means BioFold read the value from the selected structure.

## Calculated

Calculated information is derived deterministically from observed coordinates or viewer state. Examples include Euclidean atom-to-atom distance, residue counts, neighbors inside a fixed radius, and the representation currently applied. Calculated values should identify their units and input references.

## Heuristic

Heuristic information is a qualitative comparison intended to guide exploration. BioFold's mutation context compares coarse charge, size, and hydrophobicity categories and identifies spatial neighbors in the static structure. It does not predict stability, folding, binding affinity, pathogenicity, or clinical effect.

## Unavailable

Unavailable indicates that BioFold could not obtain or verify the requested evidence. The assistant must say what is missing and must not replace the missing result with an invented scientific claim.
