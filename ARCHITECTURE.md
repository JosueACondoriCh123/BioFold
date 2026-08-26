# BioFold 3D architecture

BioFold is a client-first modular monolith. The human interface and WebMCP tools do not have separate implementations: both call a shared command bus, which owns validation, provenance, error normalization, and the visible activity trail.

```text
React UI ─────┐
              ├─> Command Bus ─> Zustand state ─> Activity log
WebMCP tools ─┘        │
                      ├─> ViewerPort ─> 3Dmol.js / WebGL
                      ├─> GeometryClient ─> Web Worker
                      └─> StructureGateway ─> fixtures / RCSB
```

## Boundaries

- `core`: framework-independent geometry, mutation profiles, command semantics, and evidence labels.
- `adapters`: RCSB/fixture loading, 3Dmol rendering, worker communication, and WebMCP registration.
- `store`: serializable UI/domain state only. The WebGL viewer is held outside Zustand.
- `workers`: summary, distance, and neighborhood calculations.

## Trust and scientific policy

Inputs from both people and agents are validated by the command layer. Results distinguish observed coordinates, local calculations, heuristics, and unavailable evidence. Mutation previews never alter coordinates and never claim to predict stability, folding, function, or pathogenicity.

The only open-world request is `load_structure`, restricted to four-character PDB identifiers and the public RCSB file origin. Responses are capped at 10 MiB and 12 seconds. `1CRN` and `4HHB` are bundled for deterministic demos.

## WebMCP lifecycle

Eight narrowly scoped tools register once when `document.modelContext.registerTool` exists. Their `execute` callbacks call the same `commandBus.execute` method used by React controls and propagate cancellation signals. Without WebMCP, the complete human interface remains functional.
