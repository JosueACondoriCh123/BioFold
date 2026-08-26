import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StructureGatewayError,
  normalizePdbId,
  structureGateway,
} from "../src/adapters/structureGateway";

afterEach(() => vi.restoreAllMocks());

describe("structure gateway", () => {
  it("normalizes valid PDB IDs and rejects invalid values", () => {
    expect(normalizePdbId(" 1crn ")).toBe("1CRN");
    expect(() => normalizePdbId("ABC")).toThrow(StructureGatewayError);
  });

  it("uses the local deterministic fixture for 1CRN", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data_fixture", { status: 200 }),
    );
    const result = await structureGateway.load("1crn");
    expect(result.source).toBe("fixture");
    expect(fetchMock.mock.calls[0][0]).toContain("structures/1CRN.cif");
  });

  it("uses RCSB for other identifiers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data_remote", { status: 200 }),
    );
    const result = await structureGateway.load("7TIM");
    expect(result.source).toBe("rcsb");
    expect(fetchMock.mock.calls[0][0]).toBe("https://files.rcsb.org/download/7TIM.cif");
  });
});
