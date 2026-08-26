import * as $3Dmol from "3dmol";
import type {
  AtomRecord,
  AtomRef,
  ColorScheme,
  NeighborResidue,
  RepresentationStyle,
  ResidueRef,
} from "../types/domain";

function selectionOf(ref: ResidueRef) {
  return {
    chain: ref.chain,
    resi: ref.residueNumber,
    ...(ref.insertionCode ? { icode: ref.insertionCode } : {}),
  };
}

function colorOptions(colorScheme: ColorScheme) {
  if (colorScheme === "chain") return { colorscheme: "chain" };
  if (colorScheme === "element") return { colorscheme: "Jmol" };
  return { color: "spectrum" };
}

function styleSpec(style: RepresentationStyle, colorScheme: ColorScheme) {
  const colors = colorOptions(colorScheme);
  if (style === "cartoon") return { cartoon: { ...colors, thickness: 0.4 } };
  if (style === "stick") return { stick: { ...colors, radius: 0.2 } };
  if (style === "sphere") return { sphere: { ...colors, scale: 0.3 } };
  return { line: { ...colors, linewidth: 1.5 } };
}

class MolecularViewerPort {
  private viewer: $3Dmol.GLViewer | null = null;
  private model: $3Dmol.GLModel | null = null;
  private surfaceId: number | null = null;
  private representation: RepresentationStyle = "cartoon";
  private colorScheme: ColorScheme = "chain";

  attach(element: HTMLElement) {
    this.viewer = $3Dmol.createViewer(element, {
      backgroundColor: "#07100f",
      antialias: true,
      cartoonQuality: 10,
      disableFog: false,
    });
    this.viewer.setViewStyle({ style: "outline", color: "#173f38", width: 0.06 });
    this.viewer.render();
  }

  isReady() {
    return this.viewer !== null;
  }

  resize() {
    this.viewer?.resize().render();
  }

  load(data: string, format: "cif") {
    if (!this.viewer) throw new Error("The molecular viewer is not ready.");
    try {
      this.viewer.removeAllModels();
      this.viewer.removeAllSurfaces();
      this.viewer.removeAllLabels();
      this.viewer.removeAllShapes();
      this.surfaceId = null;
      this.model = this.viewer.addModel(data, format);
      if (!this.model || this.model.selectedAtoms({}).length === 0) {
        throw new Error("The structure contains no renderable atoms.");
      }
      this.setRepresentation("cartoon", "chain");
      this.viewer.zoomTo();
      this.viewer.render();
    } catch (error) {
      this.model = null;
      throw error;
    }
  }

  getAtoms(): AtomRecord[] {
    if (!this.model) return [];
    return this.model.selectedAtoms({}).map((atom: any, index: number) => ({
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

  setRepresentation(style: RepresentationStyle, colorScheme: ColorScheme) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.representation = style;
    this.colorScheme = colorScheme;
    this.viewer.setStyle({}, styleSpec(style, colorScheme));
    this.viewer.render();
  }

  focusResidues(residues: ResidueRef[], label: boolean) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    this.viewer.setStyle({}, styleSpec(this.representation, this.colorScheme));
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

  async showSurface(visible: boolean, opacity: number) {
    if (!this.viewer || !this.model) throw new Error("No structure is loaded.");
    if (this.surfaceId !== null) {
      this.viewer.removeSurface(this.surfaceId);
      this.surfaceId = null;
    }
    if (visible) {
      const id = await Promise.resolve(
        this.viewer.addSurface(
          $3Dmol.SurfaceType.VDW,
          { opacity, color: "#45c7a8" },
          {},
        ),
      );
      this.surfaceId = Number(id);
    }
    this.viewer.render();
  }

  showDistance(from: AtomRecord, to: AtomRecord, angstroms: number) {
    if (!this.viewer) throw new Error("The molecular viewer is not ready.");
    this.viewer.removeAllShapes();
    this.viewer.addLine({
      start: { x: from.x, y: from.y, z: from.z },
      end: { x: to.x, y: to.y, z: to.z },
      color: "#ff4fd8",
      dashed: true,
      linewidth: 3,
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
    this.viewer.setStyle({}, styleSpec(this.representation, this.colorScheme));
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
