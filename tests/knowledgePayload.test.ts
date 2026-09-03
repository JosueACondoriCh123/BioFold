import { describe, expect, it } from "vitest";
import payload from "../knowledge/generated/corpus-v2.json";
import { sha256Text, validateKnowledgePayload } from "../supabase/functions/_shared/knowledgePayload";

describe("knowledge ingestion payload", () => {
  it("accepts the committed 384D gte-small contract and verifies every chunk checksum", async () => {
    const parsed = validateKnowledgePayload(payload);
    expect(parsed.sources.length).toBeGreaterThan(0);
    for (const source of parsed.sources) for (const chunk of source.chunks) expect(await sha256Text(chunk.content)).toBe(chunk.checksum);
  });

  it("rejects dimension drift, oversized content, discontinuous indexes, and bad hashes", () => {
    const clone = () => structuredClone(payload) as typeof payload;
    const dimensions = clone(); dimensions.embedding.dimensions = 768;
    expect(() => validateKnowledgePayload(dimensions)).toThrow(/384D/);
    const oversized = clone(); oversized.sources[0]!.chunks[0]!.content = "x".repeat(1201);
    expect(() => validateKnowledgePayload(oversized)).toThrow(/invalid|limits/);
    const index = clone(); index.sources[0]!.chunks[0]!.index = 2;
    expect(() => validateKnowledgePayload(index)).toThrow(/contiguous/);
    const hash = clone(); hash.sources[0]!.chunks[0]!.checksum = "bad";
    expect(() => validateKnowledgePayload(hash)).toThrow(/SHA-256/);
  });
});
