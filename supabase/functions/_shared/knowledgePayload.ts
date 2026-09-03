type JsonRecord = Record<string, unknown>;
export type ValidKnowledgeChunk = { index: number; title: string; content: string; locator: string; wordCount: number; checksum: string };
export type ValidKnowledgeSource = {
  id: string; title: string; publisher: string; url: string; license: string;
  retrievedAt: string; contentPath: string; checksum: string; chunks: ValidKnowledgeChunk[];
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function text(value: unknown, label: string, max = 10_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw new Error(`${label} must be an integer.`);
  return value;
}

function checksum(value: unknown, label: string) {
  const parsed = text(value, label, 64);
  if (!/^[a-f0-9]{64}$/.test(parsed)) throw new Error(`${label} must be lowercase SHA-256.`);
  return parsed;
}

export function validateKnowledgePayload(value: unknown) {
  const payload = record(value, "payload");
  if (payload.schemaVersion !== 2) throw new Error("Only knowledge payload schema v2 is accepted.");
  const embedding = record(payload.embedding, "embedding");
  if (embedding.model !== "gte-small" || embedding.dimensions !== 384 || embedding.meanPool !== true || embedding.normalize !== true) throw new Error("Embeddings must use normalized 384D gte-small output.");
  const chunking = record(payload.chunking, "chunking");
  if (chunking.maxCharacters !== 1200 || chunking.maxWords !== 180) throw new Error("Unexpected chunk limits.");
  if (!Array.isArray(payload.sources) || payload.sources.length < 1 || payload.sources.length > 100) throw new Error("sources must contain 1–100 entries.");
  const ids = new Set<string>();
  const sources: ValidKnowledgeSource[] = payload.sources.map((candidate, sourceIndex) => {
    const source = record(candidate, `source ${sourceIndex}`);
    const id = text(source.id, "source id", 160);
    if (ids.has(id)) throw new Error(`Duplicate source id: ${id}.`);
    ids.add(id);
    if (!Array.isArray(source.chunks) || source.chunks.length < 1 || source.chunks.length > 10_000) throw new Error(`${id} has invalid chunks.`);
    const chunks = source.chunks.map((item, chunkIndex): ValidKnowledgeChunk => {
      const chunk = record(item, `${id} chunk ${chunkIndex}`);
      const content = text(chunk.content, "chunk content", 1200);
      const words = content.trim().split(/\s+/u).length;
      if (words > 180 || content.length > 1200) throw new Error(`${id} chunk ${chunkIndex} exceeds limits.`);
      const index = integer(chunk.index, "chunk index");
      if (index !== chunkIndex) throw new Error(`${id} chunks must have contiguous zero-based indexes.`);
      const declaredWords = integer(chunk.wordCount, "chunk word count", 1);
      if (declaredWords !== words) throw new Error(`${id} chunk ${chunkIndex} has an incorrect word count.`);
      return { index, title: text(chunk.title, "chunk title", 500), content, locator: text(chunk.locator, "chunk locator", 500), wordCount: declaredWords, checksum: checksum(chunk.checksum, "chunk checksum") };
    });
    return {
      id, title: text(source.title, "source title", 500), publisher: text(source.publisher, "publisher", 120),
      url: text(source.url, "source URL", 2_000), license: text(source.license, "license", 120),
      retrievedAt: text(source.retrievedAt, "retrievedAt", 32), contentPath: text(source.contentPath, "contentPath", 500),
      checksum: checksum(source.checksum, "source checksum"), chunks,
    };
  });
  return { corpusVersion: text(payload.corpusVersion, "corpusVersion", 80), sources };
}

export async function sha256Text(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
