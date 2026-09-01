import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve("src/platform.css"), "utf8");
const lab = readFileSync(resolve("src/styles.css"), "utf8");
const tokens = Object.fromEntries([...css.matchAll(/--(bf-[\w-]+):\s*(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }

it("keeps primary, muted and semantic text at AA contrast on each base surface", () => {
  for (const fg of ["bf-text", "bf-muted", "bf-accent", "bf-turquoise", "bf-rose", "bf-amber", "bf-error"]) {
    for (const bg of ["bf-bg", "bf-panel", "bf-raised"]) expect(contrast(tokens[fg], tokens[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast("#13231c", tokens["bf-accent"])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens["bf-input-line"], tokens["bf-panel"])).toBeGreaterThanOrEqual(3);
});
it("does not reintroduce tiny laboratory labels or remote font requests", () => {
  const sizes = [...lab.matchAll(/font-size:\s*(\d+)px/g)].map(match => Number(match[1]));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  expect(css).not.toMatch(/@import|fonts\.google/);
  expect(css).toContain("prefers-reduced-motion");
});
