/// <reference lib="webworker" />

import {
  findNeighborResidues,
  measureAtomDistance,
  summarizeAtoms,
} from "../core/geometry";
import type { AtomRecord, AtomRef, ResidueRef } from "../types/domain";

type GeometryRequest =
  | { id: string; task: "summary"; atoms: AtomRecord[] }
  | { id: string; task: "distance"; atoms: AtomRecord[]; from: AtomRef; to: AtomRef }
  | { id: string; task: "neighbors"; atoms: AtomRecord[]; target: ResidueRef; radius: number };

self.onmessage = (event: MessageEvent<GeometryRequest>) => {
  const request = event.data;
  try {
    let result: unknown;
    if (request.task === "summary") {
      result = summarizeAtoms(request.atoms);
    } else if (request.task === "distance") {
      result = measureAtomDistance(request.atoms, request.from, request.to);
    } else {
      result = findNeighborResidues(request.atoms, request.target, request.radius);
    }
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : "Geometry calculation failed.",
        code:
          error && typeof error === "object" && "code" in error
            ? (error as { code: string }).code
            : undefined,
      },
    });
  }
};

export {};
