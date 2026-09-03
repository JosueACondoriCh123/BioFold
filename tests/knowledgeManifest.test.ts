import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeMarkdown } from "../scripts/knowledge.mjs";

interface KnowledgeManifest {
  schemaVersion: number;
  embedding: { model: string; dimensions: number; meanPool: boolean; normalize: boolean };
  chunking: { maxCharacters: number; maxWords: number };
  sources: Array<{
    id: string;
    contentPath: string;
    sha256: string;
  }>;
}

describe("curated knowledge manifest", () => {
  it("contains reproducible checksums for every local source", async () => {
    const knowledgeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../knowledge");
    const manifest = JSON.parse(await readFile(resolve(knowledgeRoot, "manifest.json"), "utf8")) as KnowledgeManifest;
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      embedding: { model: "gte-small", dimensions: 384, meanPool: true, normalize: true },
      chunking: { maxCharacters: 1200, maxWords: 180 },
    });
    expect(manifest.sources.length).toBeGreaterThan(0);
    for (const source of manifest.sources) {
      const content = normalizeMarkdown(await readFile(resolve(knowledgeRoot, source.contentPath), "utf8"));
      expect(createHash("sha256").update(content).digest("hex"), source.id).toBe(source.sha256);
    }
  });
});
