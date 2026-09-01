import {
  GeometryError,
  findNeighborResidues,
  measureAtomDistance,
  summarizeAtoms,
} from "../core/geometry";
import type { AtomRecord, AtomRef, ResidueRef } from "../types/domain";

interface WorkerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string; code?: "SELECTION_NOT_FOUND" | "AMBIGUOUS_ATOM" };
}

class GeometryClient {
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  private ensureWorker() {
    if (this.worker) return;
    if (typeof Worker !== "undefined" && import.meta.env.MODE !== "test") {
      this.worker = new Worker(new URL("../workers/geometry.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        this.pending.delete(event.data.id);
        if (event.data.ok) {
          pending.resolve(event.data.result);
        } else if (event.data.error?.code) {
          pending.reject(
            new GeometryError(event.data.error.code, event.data.error.message),
          );
        } else {
          pending.reject(new Error(event.data.error?.message ?? "Geometry worker failed."));
        }
      };
      this.worker.onerror = () => this.dispose(new Error("The geometry worker failed."));
      this.worker.onmessageerror = () => this.dispose(new Error("The geometry worker response could not be read."));
    }
  }

  dispose(error: Error = new DOMException("Cancelled", "AbortError")) {
    this.worker?.terminate();
    this.worker = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) request.reject(error);
  }

  private request<T>(payload: Record<string, unknown>, fallback: () => T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
    this.ensureWorker();
    if (!this.worker) return Promise.resolve().then(() => {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      return fallback();
    });

    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        this.pending.delete(id);
        signal?.removeEventListener("abort", cancel);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", cancel);
          resolve(value as T);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", cancel);
          reject(error);
        },
      });
      try {
        this.worker?.postMessage({ id, ...payload });
      } catch (error) {
        this.pending.delete(id);
        signal?.removeEventListener("abort", cancel);
        reject(error);
      }
    });
  }

  summarize(atoms: AtomRecord[], signal?: AbortSignal) {
    return this.request({ task: "summary", atoms }, () => summarizeAtoms(atoms), signal);
  }

  distance(atoms: AtomRecord[], from: AtomRef, to: AtomRef, signal?: AbortSignal) {
    return this.request(
      { task: "distance", atoms, from, to },
      () => measureAtomDistance(atoms, from, to),
      signal,
    );
  }

  neighbors(atoms: AtomRecord[], target: ResidueRef, radius = 5, signal?: AbortSignal) {
    return this.request(
      { task: "neighbors", atoms, target, radius },
      () => findNeighborResidues(atoms, target, radius),
      signal,
    );
  }
}

export const geometryClient = new GeometryClient();
