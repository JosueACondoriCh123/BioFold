import type { MultimodalModelOption, SampleVisionImage, VisionAnalysisPreset } from "./types";

export const MULTIMODAL_MODELS: MultimodalModelOption[] = [
  {
    id: "minimax/minimax-01",
    label: "MiniMax-01 Multimodal",
    provider: "MiniMax",
    badge: "Recommended",
    description: "Ultra-long context multimodal reasoning with high structural detail comprehension.",
  },
  {
    id: "google/gemini-2.0-flash-lite:free",
    label: "Gemini 2.0 Flash",
    provider: "Google DeepMind",
    badge: "Fast & Free",
    description: "Sub-second vision inference optimized for molecular diagrams and plots.",
  },
  {
    id: "qwen/qwen-2.5-vl-72b-instruct:free",
    label: "Qwen 2.5 VL 72B",
    provider: "Alibaba / Open Source",
    badge: "Free",
    description: "Powerful visual grounding for coordinates, bounding boxes and fine scientific graphics.",
  },
  {
    id: "meta-llama/llama-3.2-11b-vision-instruct:free",
    label: "Llama 3.2 Vision 11B",
    provider: "Meta",
    badge: "Free",
    description: "Compact multimodal model with great diagram parsing and instruction following.",
  },
];

export const VISION_PRESETS: VisionAnalysisPreset[] = [
  {
    id: "cavity-pocket",
    title: "Binding Cavity & Pockets",
    category: "cavity",
    icon: "Scan",
    prompt:
      "Analyze the visible binding pockets, hydrophobic clefts, and surface cavities. Identify solvent accessibility and assess potential druggability or cofactor accommodation.",
  },
  {
    id: "folding-secondary",
    title: "Secondary Structure & Topology",
    category: "folding",
    icon: "Dna",
    prompt:
      "Break down the visible secondary structure elements: enumerate alpha-helices, beta-sheets, loops, and disordered termini. Comment on fold class and topological symmetry.",
  },
  {
    id: "alphafold-confidence",
    title: "AlphaFold Confidence / PAE Map",
    category: "confidence",
    icon: "Layers",
    prompt:
      "Interpret the visible confidence gradient (pLDDT color scheme or Predicted Aligned Error matrix). Distinguish rigid structural domains from flexible inter-domain linkers or disordered regions.",
  },
  {
    id: "ligand-interaction",
    title: "Ligand & Interface Contacts",
    category: "ligand",
    icon: "Atom",
    prompt:
      "Inspect the ligand-binding or protein-protein interface. Identify key coordinating residues, hydrogen bonding networks, and potential steric hindrances or mutation opportunities.",
  },
];

// Lightweight SVG representations for instant scientific testing
export const SAMPLE_VISION_IMAGES: SampleVisionImage[] = [
  {
    id: "alphafold-pae",
    name: "AlphaFold 3 PAE Matrix",
    category: "Bioinformatics",
    description: "2D Predicted Aligned Error matrix indicating multi-domain orientation.",
    suggestedPrompt: "Interpret the Predicted Aligned Error (PAE) matrix. Identify the distinct rigid domains and inter-domain flexibility.",
    dataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
          <rect width="400" height="400" fill="#0c1714"/>
          <!-- Domain 1: low error (dark green) -->
          <rect x="30" y="30" width="150" height="150" fill="#134e3f" stroke="#258a6d" stroke-width="2"/>
          <!-- Domain 2: low error (dark green) -->
          <rect x="200" y="200" width="170" height="170" fill="#134e3f" stroke="#258a6d" stroke-width="2"/>
          <!-- Off-diagonal: high error / flexible (amber/blue) -->
          <rect x="200" y="30" width="170" height="150" fill="#1d303f" stroke="#3b6982" stroke-dasharray="4"/>
          <rect x="30" y="200" width="150" height="170" fill="#1d303f" stroke="#3b6982" stroke-dasharray="4"/>
          <text x="50" y="110" fill="#5ccfb5" font-family="monospace" font-size="14" font-weight="bold">Domain 1 (Res 1-180)</text>
          <text x="215" y="290" fill="#5ccfb5" font-family="monospace" font-size="14" font-weight="bold">Domain 2 (Res 190-410)</text>
          <text x="220" y="110" fill="#f6ad55" font-family="monospace" font-size="12">Inter-domain: ~18-24 Å</text>
          <text x="40" y="290" fill="#f6ad55" font-family="monospace" font-size="12">High PAE (Flexible)</text>
          <text x="110" y="20" fill="#aab9b3" font-family="sans-serif" font-size="13">AlphaFold 3 Predicted Aligned Error</text>
        </svg>`,
      ),
  },
  {
    id: "mpro-pocket",
    name: "SARS-CoV-2 Mpro Active Site (6LU7)",
    category: "Protease & Inhibitor",
    description: "Catalytic dyad (Cys145-His41) surface with bound peptidomimetic inhibitor N3.",
    suggestedPrompt: "Analyze the active site cavity of SARS-CoV-2 Mpro (6LU7). Highlight the catalytic dyad coordination and N3 inhibitor positioning.",
    dataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
          <rect width="400" height="300" fill="#080f0d"/>
          <!-- Molecular surface cleft -->
          <path d="M 40 150 Q 150 40 250 80 T 360 220 Q 250 280 150 250 Z" fill="#162e26" stroke="#2a5a4b" stroke-width="2"/>
          <path d="M 160 120 Q 210 100 240 140 T 190 200 Z" fill="#0c1814" stroke="#e53e3e" stroke-width="2"/>
          <!-- Ligand sticks -->
          <polyline points="140,160 180,140 220,150 250,130" stroke="#f6e05e" stroke-width="5" stroke-linecap="round"/>
          <circle cx="180" cy="140" r="6" fill="#f6e05e"/>
          <circle cx="220" cy="150" r="6" fill="#4299e1"/>
          <!-- Residue labels -->
          <text x="110" y="90" fill="#5ccfb5" font-family="monospace" font-size="13">His41 (Catalytic)</text>
          <text x="240" y="220" fill="#5ccfb5" font-family="monospace" font-size="13">Cys145 (Nucleophile)</text>
          <text x="170" y="260" fill="#f6e05e" font-family="monospace" font-size="12">Inhibitor N3 (Covalent)</text>
          <text x="80" y="30" fill="#fff" font-family="sans-serif" font-size="14" font-weight="bold">SARS-CoV-2 Mpro (PDB: 6LU7)</text>
        </svg>`,
      ),
  },
  {
    id: "hemoglobin-tetramer",
    name: "Hemoglobin Quaternary State (4HHB)",
    category: "Allostery",
    description: "Deoxyhemoglobin tetramer displaying alpha1-beta2 sliding interface.",
    suggestedPrompt: "Examine the quaternary structure of 4HHB. Explain how the heme pockets and salt bridges change between T and R states.",
    dataUri:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
          <rect width="400" height="300" fill="#0a1210"/>
          <!-- Alpha 1 -->
          <circle cx="150" cy="110" r="60" fill="#2b4c7e" opacity="0.8"/>
          <text x="130" y="115" fill="#fff" font-family="sans-serif" font-size="13" font-weight="bold">α1 chain</text>
          <!-- Alpha 2 -->
          <circle cx="250" cy="190" r="60" fill="#2b4c7e" opacity="0.8"/>
          <text x="230" y="195" fill="#fff" font-family="sans-serif" font-size="13" font-weight="bold">α2 chain</text>
          <!-- Beta 1 -->
          <circle cx="250" cy="110" r="60" fill="#9b2c2c" opacity="0.8"/>
          <text x="230" y="115" fill="#fff" font-family="sans-serif" font-size="13" font-weight="bold">β1 chain</text>
          <!-- Beta 2 -->
          <circle cx="150" cy="190" r="60" fill="#9b2c2c" opacity="0.8"/>
          <text x="130" y="195" fill="#fff" font-family="sans-serif" font-size="13" font-weight="bold">β2 chain</text>
          <!-- Central cavity -->
          <circle cx="200" cy="150" r="20" fill="#0a1210" stroke="#f6ad55" stroke-width="2" stroke-dasharray="3"/>
          <text x="155" y="280" fill="#e2e8f0" font-family="sans-serif" font-size="13">Hemoglobin Tetramer (4HHB)</text>
        </svg>`,
      ),
  },
];
