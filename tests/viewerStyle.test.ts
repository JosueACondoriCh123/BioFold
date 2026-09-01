import { describe, expect, it } from "vitest";
import { buildStyleSpec } from "../src/adapters/viewerPort";
import type { RepresentationStyle } from "../src/types/domain";

describe("viewer style specification", () => {
  it.each<RepresentationStyle>(["cartoon", "stick", "sphere", "line"])(
    "uses a residue sinebow gradient for %s spectrum rendering",
    (style) => {
      const specification = buildStyleSpec(style, "spectrum", { min: 1, max: 46 });
      const styleOptions = (
        specification as unknown as Record<string, Record<string, unknown>>
      )[style];

      expect(styleOptions).toMatchObject({
        colorscheme: {
          prop: "resi",
          gradient: "sinebow",
          min: 1,
          max: 46,
        },
      });
    },
  );

  it("keeps chain and element schemes explicit", () => {
    expect(buildStyleSpec("stick", "chain")).toMatchObject({
      stick: { colorscheme: "chain" },
    });
    expect(buildStyleSpec("sphere", "element")).toMatchObject({
      sphere: { colorscheme: "Jmol" },
    });
  });
});
