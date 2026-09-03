export interface KnowledgeChunk {
  locator: string;
  content: string;
  wordCount: number;
  checksum: string;
}

export function normalizeMarkdown(value: string): string;
export function chunkMarkdown(value: string, limits: { maxCharacters: number; maxWords: number }): KnowledgeChunk[];
export function buildKnowledge(): Promise<void>;
export function checkKnowledge(): Promise<void>;
