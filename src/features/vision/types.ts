export type MultimodalModelId =
  | "minimax/minimax-01"
  | "google/gemini-2.0-flash-lite:free"
  | "qwen/qwen-2.5-vl-72b-instruct:free"
  | "meta-llama/llama-3.2-11b-vision-instruct:free";

export interface MultimodalModelOption {
  id: MultimodalModelId;
  label: string;
  provider: string;
  badge: string;
  description: string;
}

export interface VisionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  timestamp: number;
  model?: string;
  targetPdb?: string;
  detectedPdbs?: string[];
  latencyMs?: number;
}

export interface VisionAnalysisPreset {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  category: "cavity" | "folding" | "confidence" | "ligand";
}

export interface SampleVisionImage {
  id: string;
  name: string;
  category: string;
  description: string;
  dataUri: string;
  suggestedPrompt: string;
}
