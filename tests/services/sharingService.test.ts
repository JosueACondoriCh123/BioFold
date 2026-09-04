import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateShareToken,
  enableProjectSharing,
  disableProjectSharing,
  getSharedProject,
  saveLocalShare,
  clearLocalShares,
} from "../../src/services/sharingService";

import type { SharedProjectData } from "../../src/services/sharingService";

describe("SharingService (Public Read-Only Sharing)", () => {
  beforeEach(() => {
    clearLocalShares();
    if (typeof localStorage !== "undefined" && localStorage?.clear) {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });


  it("generates unique share tokens with sh_ prefix", () => {
    const token1 = generateShareToken();
    const token2 = generateShareToken();

    expect(token1).toMatch(/^sh_[a-z0-9]+$/);
    expect(token2).toMatch(/^sh_[a-z0-9]+$/);
    expect(token1).not.toBe(token2);
  });

  it("enables sharing and returns a share URL with the token", async () => {
    const res = await enableProjectSharing("test-project-123");

    expect(res.shareToken).toBeDefined();
    expect(res.shareToken).toMatch(/^sh_/);
    expect(res.shareUrl).toContain(`/share/${res.shareToken}`);
  });

  it("stores and retrieves shared projects from local shares cache", async () => {
    const mockData: SharedProjectData = {
      project: {
        id: "proj-abc",
        title: "SARS-CoV-2 Main Protease",
        description: "Study of 6LU7 active site",
        activePdbId: "6LU7",
        revision: 4,
        isPublic: true,
        shareToken: "sh_demo123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: "user-xyz",
        snapshot: {
          schemaVersion: 1,
          structure: { pdbId: "6LU7", source: "rcsb" },
          view: { representation: "cartoon", colorScheme: "chain", camera: null },
          surface: { visible: false, opacity: 0.8 },
          selectedResidues: [{ chain: "A", residueNumber: 145 }],
        },
      },
      annotations: [
        {
          id: "ann-1",
          pdbId: "6LU7",
          chain: "A",
          residueNumber: 145,
          note: "Catalytic Cys145",
          color: "#5ccfb5",
          createdAt: new Date().toISOString(),
        },
      ],
      events: [],
    };

    saveLocalShare("sh_demo123", mockData);

    const retrieved = await getSharedProject("sh_demo123");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.project.id).toBe("proj-abc");
    expect(retrieved?.project.title).toBe("SARS-CoV-2 Main Protease");
    expect(retrieved?.project.activePdbId).toBe("6LU7");
    expect(retrieved?.annotations).toHaveLength(1);
    expect(retrieved?.annotations[0].note).toBe("Catalytic Cys145");
  });

  it("returns null when share token does not exist or is empty", async () => {
    const emptyResult = await getSharedProject("");
    expect(emptyResult).toBeNull();

    const missingResult = await getSharedProject("non_existent_token_999");
    expect(missingResult).toBeNull();
  });

  it("disables project sharing and purges the local share entry", async () => {
    const mockData: SharedProjectData = {
      project: {
        id: "proj-to-revoke",
        title: "Revocable Workspace",
        description: "Testing revocation",
        activePdbId: "1CRN",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: "user-1",
        snapshot: {
          schemaVersion: 1,
          structure: { pdbId: "1CRN", source: "fixture" },
          view: { representation: "cartoon", colorScheme: "chain", camera: null },
          surface: { visible: false, opacity: 0.8 },
          selectedResidues: [],
        },
      },
      annotations: [],
      events: [],
    };

    saveLocalShare("sh_revoke_token", mockData);
    let check = await getSharedProject("sh_revoke_token");
    expect(check).not.toBeNull();

    await disableProjectSharing("proj-to-revoke");
    check = await getSharedProject("sh_revoke_token");
    expect(check).toBeNull();
  });
});
