import { describe, expect, it } from "vitest";
import { checkKnowledge, chunkMarkdown, normalizeMarkdown } from "../scripts/knowledge.mjs";

describe("reproducible knowledge pipeline", () => {
  it("normalizes line endings and paragraph whitespace deterministically", () => {
    expect(normalizeMarkdown("# Title\r\n\r\n  one   two \r\n three  \r\n")).toBe("# Title\n\none two three\n");
  });

  it("keeps every chunk within 1,200 characters and 180 words", () => {
    const source = `# Long\n\n${Array.from({ length: 500 }, (_, index) => `word${index}`).join(" ")}`;
    const chunks = chunkMarkdown(source, { maxCharacters: 1200, maxWords: 180 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 1200 && chunk.wordCount <= 180)).toBe(true);
    expect(chunkMarkdown(source, { maxCharacters: 1200, maxWords: 180 })).toEqual(chunks);
  });

  it("keeps the committed manifest, payload, and seed in sync", async () => {
    await expect(checkKnowledge()).resolves.toBeUndefined();
  });
});
