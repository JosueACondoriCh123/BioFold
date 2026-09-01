import * as $3Dmol from "3dmol";
import { captureViewerListeners } from "./viewerLifetime";
import type {
  AtomRecord,
  AtomRef,
  ColorScheme,
  NeighborResidue,
  RepresentationStyle,
  ResidueRef,
} from "../types/domain";
import { parseViewerCameraState, type ViewerCameraState } from "../types/projects";

function selectionOf(ref: ResidueRef) {
  return {
    chain: ref.chain,
    resi: ref.residueNumber,
    ...(ref.insertionCode ? { icode: ref.insertionCode } : {}),
  };
}

export interface ResidueColorRange {
  min: number;
  max: number;
}

function residueColorRange(atoms: AtomRecord[]): ResidueColorRange {
  const residueNumbers = atoms
    .map((atom) => atom.residueNumber)
    .filter((value) => Number.isFinite(value));
  if (residueNumbers.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...residueNumbers);
  const max = Math.max(...residueNumbers);
  return { min, max: min === max ? min + 1 : max };
}

function colorOptions(colorScheme: ColorScheme, range: ResidueColorRange) {
  if (colorScheme === "chain") return { colorscheme: "chain" };
  if (colorScheme === "element") return { colorscheme: "Jmol" };
  return {
    colorscheme: {
      prop: "resi",
      gradient: "sinebow",
      min: range.min,
      max: range.max,
    },
  };
}

export function buildStyleSpec(
  style: RepresentationStyle,
  colorScheme: ColorScheme,
  range: ResidueColorRange = { min: 0, max: 1 },
) {
  const colors = colorOptions(colorScheme, range);
  if (style === "cartoon") return { cartoon: { ...colors, thickness: 0.4 } };
  if (style === "stick") return { stick: { ...colors, radius: 0.2 } };
  if (style === "sphere") return { sphere: { ...colors, scale: 0.3 } };
  return { line: { ...colors, linewidth: 1.5 } };
}

export class ViewerPortError extends Error {
  constructor(
    public readonly code: "PARSE_FAILED" | "RENDER_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ViewerPortError";
  }
}

export interface PreparedStructure {
  readonly model: $3Dmol.GLModel;
  readonly atoms: AtomRecord[];
  committed: boolean;
  discarded: boolean;
  readonly owner?: $3Dmol.GLViewer;
}

function toAtomRecords(model: $3Dmol.GLModel): AtomRecord[] {
  return model.selectedAtoms({}).map((atom: any, index: number) => ({
    serial: Number(atom.serial ?? atom.index ?? index),
    atomName: String(atom.atom ?? atom.elem ?? "").trim(),
    element: String(atom.elem ?? atom.atom ?? "").trim(),
    chain: String(atom.chain ?? "").trim(),
    residueNumber: Number(atom.resi),
    residueName: String(atom.resn ?? "UNK").trim(),
    insertionCode: atom.icode ? String(atom.icode) : undefined,
    x: Number(atom.x),
    y: Number(atom.y),
    z: Number(atom.z),
    hetero: Boolean(atom.hetflag),
  }));
}

class MolecularViewerPort {
  private viewer: $3Dmol.GLViewer | null = null;
  private model: $3Dmol.GLModel | null = null;
  private surfaceId: number | null = null;
  private representation: RepresentationStyle = "cartoon";
  private colorScheme: ColorScheme = "chain";
  private removeListeners?: () => void;
  private element: HTMLElement | null = null;
  private suspended = false;
  private readonly viewListeners = new Set<(view: ViewerCameraState) => void>();

  attach(element: HTMLElement) {
    if (this.viewer && this.element === element) return;
    this.dispose();
    const canvas = document.createElement("canvas");
    try {
      const captured = captureViewerListeners([window, document.body, canvas], () => $3Dmol.createViewer(element, {
        canvas,
        backgroundColor: "#07100f",
        antialias: true,
        cartoonQuality: 10,
        disableFog: false,
      }));
      this.removeListeners = captured.cleanup;
      this.viewer = captured.value;
      this.element = element;
      this.suspended = false;
      this.viewer.setViewStyle({ style: "outline", color: "#173f38", width: 0.06 });
      this.viewer.setViewChangeCallback((view: unknown) => {
        try {
          const camera = parseViewerCameraState(view);
          for (const listener of this.viewListeners) listener(camera);
        } catch {
          // Ignore transient or provider-specific camera payloads.
        }
      });
      this.viewer.render();
    } catch (error) {
      this.dispose();
      throw new ViewerPortError(
        "RENDER_FAILED",
        error instanceof Error
          ? `WebGL initialization failed: ${error.message}`
          : "WebGL initialization failed on this device.",
      );
    }
  }

  isReady() {
    return this.viewer !== null;
  }

  getView(): ViewerCameraState | null {
    if (!this.viewer) return null;
    return parseViewerCameraState(this.viewer.getView());
  }

  setView(view: ViewerCameraState) {
    if (!this.viewer) throw new ViewerPortError("RENDER_FAILED", "The molecular viewer is not ready.");
    this.viewer.setView([...parseViewerCameraState(view)]).render();
  }

  subscribeViewChanges(listener: (view: ViewerCameraState) => void) {
    this.viewListeners.add(listener);
    return () => { this.viewListeners.delete(listener); };
  }

  resize() {
    if (this.suspended || !this.element?.clientWidth || !this.element.clientHeight) return;
    this.viewer?.resize().render();
  }

  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) {
      this.viewer?.spin(false);
      this.viewer?.stopAnimate();
    } else this.resize();
  }

  dispose() {
    const viewer = this.viewer;
    this.viewer = null;
    this.model = null;
    this.surfaceId = null;
    this.element = null;
    this.removeListeners?.();
    this.removeListeners = undefined;
    if (!viewer) return;
    // These observer fields are part of the installed 3Dmol 2.5 implementation.
    const observers = viewer as unknown as { divwatcher?: ResizeObserver; intwatcher?: IntersectionObserver };
    observers.divwatcher?.disconnect();
    observers.intwatcher?.disconnect();
    viewer.spin(false);
    viewer.stopAnimate();
    viewer.setViewChangeCallback(null);
    viewer.setStateChangeCallback(null);
    const canvas = viewer.getCanvas();
    try { viewer.clear(); } catch {
      // A lost WebGL context must not prevent logout/cleanup.
    } finally {
      canvas.remove();
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }

  prepareStructure(data: string, format: "cif"): PreparedStructure {
    if (!this.viewer) {
      throw new ViewerPortError("RENDER_FAILED", "The molecular viewer is not ready.");
    }
    let preparedModel: $3Dmol.GLModel | undefined;
    try {
      preparedModel = this.viewer.addModel(data, format);
      const atoms = toAtomRecords(preparedModel);
      if (atoms.length === 0) {
        this.viewer.removeModel(preparedModel);
        preparedModel = undefined;
        throw new ViewerPortError(
          "PARSE_FAILED",
          "The structure contains no renderable atoms.",
        );
      }
      preparedModel.setStyle({}, buildStyleSpec("cartoon", "chain"));
      return { model: preparedModel, atoms, owner: this.viewer, committed: false, discarded: false };
    } catch (error) {
      if (preparedModel) this.viewer.removeModel(preparedModel);
      if (error instanceof ViewerPortError) throw error;
      throw new ViewerPortError(
        "PARSE_FAILED",
        error instanceof Error ? error.message : "The mmCIF structure could not be parsed.",
      );
    }
  }

  commitStructure(prepared: PreparedStructure) {
    if (!this.viewer) {
      throw new ViewerPortError("RENDER_FAILED", "The molecular viewer is not ready.");
    }
    if (prepared.committed || prepared.discarded || (prepared.owner && prepared.owner !== this.viewer)) {
      throw new ViewerPortError("RENDER_FAILED", "The prepared structure is no longer available.");
    }

    const previousModel = this.model;
    try {
      // Render the candidate before removing the current model. If WebGL rejects it,
      // the previous scene can be restored without changing application state.
      previousModel?.setStyle({}, {});
      prepared.model.setStyle({}, buildStyleSpec("cartoon", "chain"));
      this.viewer.zoomTo();
      this.viewer.render();
    } catch (error) {
      previousModel?.setStyle(
        {},
        buildStyleSpec(
          this.representation,
          this.colorScheme,
          previousModel ? residueColorRange(toAtomRecords(previousModel)) : undefined,
        ),
      );
      this.viewer.removeModel(prepared.model);
      prepared.discarded = true;
      try {
        this.viewer.render();
      } catch {
        // The original rendering error remains the useful failure for the caller.
      }
      throw new ViewerPortError(
        "RENDER_FAILED",
        error instanceof Error ? error.message : "The molecular scene could not be rendered.",
      );
    }

    if (previousModel) this.viewer.removeModel(previousModel);
    this.viewer.removeAllSurfaces();
    this.viewer.removeAllLabels();
    this.viewer.removeAllShapes();
    this.surfaceId = null;
    this.model = prepared.model;
    this.representation = "cartoon";
    this.colorScheme = "chain";
    prepared.committed = true;
    this.viewer.zoomTo();
    this.viewer.render();
  }

  discardStructure(prepared: PreparedStructure) {
    if (prepared.committed || prepared.discarded) return;
    (prepared.owner ?? this.viewer)?.removeModel(prepared.model);
    prepared.discarded = true;
  }

  getAtoms(): AtomRecord[] {
    if (!this.model) return [];
    return toAtomRecords(this.model);
  }

  setRepresentation(style: RepresentationStyle, colorScheme: ColorScheme) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.representation = style;
    this.colorScheme = colorScheme;
    this.viewer.setStyle({}, buildStyleSpec(style, colorScheme, residueColorRange(this.getAtoms())));
    this.viewer.render();
  }

  focusResidues(residues: ResidueRef[], label: boolean) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.viewer.setStyle(
      {},
      buildStyleSpec(this.representation, this.colorScheme, residueColorRange(this.getAtoms())),
    );
    this.viewer.removeAllLabels();
    this.viewer.removeAllShapes();
    for (const residue of residues) {
      const selection = selectionOf(residue);
      this.viewer.addStyle(selection, {
        stick: { color: "#35e0bd", radius: 0.25 },
        sphere: { color: "#35e0bd", scale: 0.28 },
      });
      if (label) {
        this.viewer.addLabel(`${residue.chain}:${residue.residueNumber}`, {
          backgroundColor: "#0d2e29",
          backgroundOpacity: 0.92,
          borderColor: "#35e0bd",
          borderThickness: 1,
          fontColor: "#d9fff6",
          fontSize: 12,
        }, selection);
      }
    }
    this.viewer.zoomTo(residues.length === 1 ? selectionOf(residues[0]) : {});
    this.viewer.render();
  }

  async showSurface(visible: boolean, opacity: number, signal?: AbortSignal) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    if (signal?.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }
    const previousSurfaceId = this.surfaceId;
    const viewer = this.viewer;

    if (visible) {
      // Keep the candidate invisible until complete; the applied surface survives cancellation.
      const pending = viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0, color: "#45c7a8" }, {});
      const nextSurfaceId = typeof pending === "number" ? pending : pending.surfid;
      let abort: (() => void) | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          abort = () => {
            viewer.removeSurface(nextSurfaceId);
            reject(new DOMException("Cancelled", "AbortError"));
          };
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) abort();
          Promise.resolve(pending).then(() => resolve(), reject);
        });
        if (signal?.aborted || this.viewer !== viewer) throw new DOMException("Cancelled", "AbortError");
        viewer.setSurfaceMaterialStyle(nextSurfaceId, { opacity, color: "#45c7a8" });
        viewer.render();
        if (previousSurfaceId !== null) viewer.removeSurface(previousSurfaceId);
        this.surfaceId = nextSurfaceId;
      } catch (error) {
        viewer.removeSurface(nextSurfaceId);
        throw error;
      } finally {
        if (abort) signal?.removeEventListener("abort", abort);
      }
    } else if (previousSurfaceId !== null) {
      viewer.removeSurface(previousSurfaceId);
      this.surfaceId = null;
    }
    viewer.render();
  }

  showDistance(from: AtomRecord, to: AtomRecord, angstroms: number) {
    if (!this.viewer) throw new Error("The molecular viewer is not ready.");
    this.viewer.removeAllShapes();
    this.viewer.addLine({
      start: { x: from.x, y: from.y, z: from.z },
      end: { x: to.x, y: to.y, z: to.z },
      color: "#ff4fd8",
      dashed: true,
      linewidth: 4,
    });
    this.viewer.addSphere({
      center: { x: from.x, y: from.y, z: from.z },
      radius: 0.28,
      color: "#ff4fd8",
      opacity: 0.96,
    });
    this.viewer.addSphere({
      center: { x: to.x, y: to.y, z: to.z },
      radius: 0.28,
      color: "#ff4fd8",
      opacity: 0.96,
    });
    const midpoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      z: (from.z + to.z) / 2,
    };
    this.viewer.addLabel(`${angstroms.toFixed(2)} Å`, {
      position: midpoint,
      backgroundColor: "#3f133b",
      backgroundOpacity: 0.94,
      borderColor: "#ff4fd8",
      borderThickness: 1,
      fontColor: "#fff0fb",
      fontSize: 13,
    });
    this.viewer.render();
  }

  previewMutation(target: ResidueRef, neighbors: NeighborResidue[]) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.viewer.setStyle(
      {},
      buildStyleSpec(this.representation, this.colorScheme, residueColorRange(this.getAtoms())),
    );
    this.viewer.removeAllLabels();
    this.viewer.removeAllShapes();
    for (const neighbor of neighbors) {
      this.viewer.addStyle(selectionOf(neighbor), {
        stick: { color: "#35e0bd", radius: 0.16 },
      });
    }
    const targetSelection = selectionOf(target);
    this.viewer.addStyle(targetSelection, {
      stick: { color: "#ffb454", radius: 0.28 },
      sphere: { color: "#ffb454", scale: 0.32 },
    });
    this.viewer.addLabel(`Mutation context · ${target.chain}:${target.residueNumber}`, {
      backgroundColor: "#38250d",
      backgroundOpacity: 0.95,
      borderColor: "#ffb454",
      borderThickness: 1,
      fontColor: "#fff6e5",
      fontSize: 12,
    }, targetSelection);
    this.viewer.zoomTo(targetSelection);
    this.viewer.render();
  }

  resetView() {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.viewer.removeAllLabels();
    this.viewer.removeAllShapes();
    if (this.surfaceId !== null) {
      this.viewer.removeSurface(this.surfaceId);
      this.surfaceId = null;
    }
    this.setRepresentation("cartoon", "chain");
    this.viewer.zoomTo();
    this.viewer.render();
  }

  clear() {
    if (!this.viewer) return;
    this.viewer.removeAllModels();
    this.viewer.removeAllSurfaces();
    this.viewer.removeAllLabels();
    this.viewer.removeAllShapes();
    this.model = null;
    this.surfaceId = null;
    this.viewer.render();
  }

  zoom(delta: number) {
    this.viewer?.zoom(delta).render();
  }

  spin(enabled: boolean) {
    this.viewer?.spin(enabled ? "y" : false);
  }

  getAtomSelection(ref: AtomRef) {
    return {
      ...selectionOf(ref),
      atom: ref.atomName,
    };
  }
}

export const viewerPort = new MolecularViewerPort();
