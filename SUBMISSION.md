# WebMCP Challenge submission copy

## Description

BioFold 3D is a shared molecular workspace where a person and an AI agent inspect the same live protein structure. The interface renders public PDB coordinates in WebGL, while eight WebMCP tools let an agent load structures, summarize them, focus residues, change representations, calculate surfaces, measure atomic distances, preview mutation context, and reset the workspace.

## Why this is a strong fit for WebMCP

Molecular viewers are precise but interaction-heavy: users must know residue identifiers, chain names, representations, and camera controls. Screenshot-based automation is brittle and cannot reliably communicate which atoms were selected or how a distance was calculated. WebMCP gives the agent narrow scientific contracts while preserving the viewer as the shared source of truth.

## Better user experience

People can express intent in natural language and immediately inspect every change in the 3D scene. Human and agent controls share the same validation and activity log, so users can take over at any point, verify provenance, and distinguish observations from calculations or heuristics.

## What becomes possible

An agent can prepare a complete visual investigation—load a structure, inspect its composition, highlight a residue, measure two atoms, and map nearby mutation context—while the person rotates the scene, changes styling, or corrects the selection. Previously, coordinating that workflow required fragile UI automation or a separate scientific backend disconnected from the visible page.

## WebMCP implementation

The app feature-detects `document.modelContext.registerTool` and registers eight imperative tools with narrow JSON Schemas and behavioral annotations. Every `execute` callback invokes the same TypeScript command bus used by React, forwards `AbortSignal`, and returns a structured result containing status, evidence level, provenance, verification data, and an activity identifier. Without WebMCP, the full human interface continues to work.

## Links

- Live application: _add after Vercel deployment_
- Public repository: _add after GitHub publication_
- Demo video: _add after YouTube publication_
