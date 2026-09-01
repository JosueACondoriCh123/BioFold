import { describe, expect, it } from "vitest";
import {
  buildCallbackRedirect,
  parseAuthRedirect,
  sanitizeReturnPath,
  stripAuthParams,
} from "../../src/auth/authRedirect";

describe("parseAuthRedirect", () => {
  it("reads PKCE code, type and next from the query string", () => {
    const info = parseAuthRedirect(
      "https://app.biofold.dev/auth/callback?code=abc123&type=recovery&next=%2Fapp%2Flab",
    );
    expect(info).toMatchObject({
      hasAuthParams: true,
      code: "abc123",
      type: "recovery",
      next: "/app/lab",
    });
  });

  it("reads implicit tokens and errors from the hash fragment", () => {
    const info = parseAuthRedirect(
      "https://app.biofold.dev/#access_token=tok&refresh_token=ref&type=recovery",
    );
    expect(info).toMatchObject({
      hasAuthParams: true,
      accessToken: "tok",
      refreshToken: "ref",
      type: "recovery",
    });

    const errorInfo = parseAuthRedirect(
      "https://app.biofold.dev/#error=access_denied&error_code=403&error_description=User+cancelled",
    );
    expect(errorInfo).toMatchObject({
      hasAuthParams: true,
      error: "access_denied",
      errorDescription: "User cancelled",
    });
  });

  it("treats a bare type=recovery marker as non-exchangeable but cleanable", () => {
    const info = parseAuthRedirect("https://app.biofold.dev/reset-password#type=recovery");
    expect(info.type).toBe("recovery");
    expect(info.hasAuthParams).toBe(false);
    expect(info.needsCleaning).toBe(true);
  });

  it("reports no auth params for ordinary URLs", () => {
    const info = parseAuthRedirect("https://app.biofold.dev/app/lab?pdb=4HHB");
    expect(info.hasAuthParams).toBe(false);
    expect(info.code).toBeUndefined();
    expect(info.error).toBeUndefined();
  });
});

describe("stripAuthParams", () => {
  it("removes PKCE code and type while preserving next", () => {
    const cleaned = stripAuthParams(
      "https://app.biofold.dev/auth/callback?code=abc123&type=recovery&next=/app",
    );
    expect(cleaned).toBe("https://app.biofold.dev/auth/callback?next=%2Fapp");
  });

  it("removes tokens from the hash and drops the empty fragment", () => {
    const cleaned = stripAuthParams(
      "https://app.biofold.dev/#access_token=tok&refresh_token=ref&type=recovery",
    );
    expect(cleaned).toBe("https://app.biofold.dev/");
  });

  it("removes error parameters from the hash", () => {
    const cleaned = stripAuthParams(
      "https://app.biofold.dev/#error=access_denied&error_description=User+cancelled",
    );
    expect(cleaned).toBe("https://app.biofold.dev/");
  });

  it("keeps non-auth parameters such as pdb untouched", () => {
    const url = "https://app.biofold.dev/app/lab?pdb=4HHB";
    expect(stripAuthParams(url)).toBe(url);
  });

  it("cleans auth params from hash and search at the same time", () => {
    const cleaned = stripAuthParams(
      "https://app.biofold.dev/auth/callback?code=abc&next=/app#access_token=tok",
    );
    expect(cleaned).toBe("https://app.biofold.dev/auth/callback?next=%2Fapp");
  });
});

describe("sanitizeReturnPath", () => {
  it("accepts internal app paths including query strings", () => {
    expect(sanitizeReturnPath("/app/lab")).toBe("/app/lab");
    expect(sanitizeReturnPath("/app/lab?pdb=4HHB")).toBe("/app/lab?pdb=4HHB");
  });

  it("rejects absolute URLs, protocol-relative paths and schemes", () => {
    expect(sanitizeReturnPath("https://evil.com/phish")).toBe("/app");
    expect(sanitizeReturnPath("http://evil.com")).toBe("/app");
    expect(sanitizeReturnPath("//evil.com")).toBe("/app");
    expect(sanitizeReturnPath("/\\evil.com")).toBe("/app");
    expect(sanitizeReturnPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects relative fragments and empty values", () => {
    expect(sanitizeReturnPath("app/lab")).toBe("/app");
    expect(sanitizeReturnPath("   ")).toBe("/app");
    expect(sanitizeReturnPath("")).toBe("/app");
    expect(sanitizeReturnPath(undefined)).toBe("/app");
    expect(sanitizeReturnPath(null)).toBe("/app");
  });

  it("rejects encoded open-redirect attempts", () => {
    expect(sanitizeReturnPath("%2F%2Fevil.com")).toBe("/app");
    expect(sanitizeReturnPath("%2F%5Cevil.com")).toBe("/app");
    expect(sanitizeReturnPath("%252F%252Fevil.com")).toBe("/app");
  });

  it("honors a custom fallback", () => {
    expect(sanitizeReturnPath("https://evil.com", "/login")).toBe("/login");
  });
});

describe("buildCallbackRedirect", () => {
  it("builds a same-origin callback with the sanitized next encoded", () => {
    expect(buildCallbackRedirect("https://app.biofold.dev", "/app/lab")).toBe(
      "https://app.biofold.dev/auth/callback?next=%2Fapp%2Flab",
    );
  });

  it("defaults to /app when no return destination is given", () => {
    expect(buildCallbackRedirect("https://app.biofold.dev")).toBe(
      "https://app.biofold.dev/auth/callback?next=%2Fapp",
    );
  });

  it("neutralizes external return destinations", () => {
    expect(buildCallbackRedirect("https://app.biofold.dev", "https://evil.com")).toBe(
      "https://app.biofold.dev/auth/callback?next=%2Fapp",
    );
  });

  it("strips trailing slashes from the origin", () => {
    expect(buildCallbackRedirect("https://app.biofold.dev/", "/app")).toBe(
      "https://app.biofold.dev/auth/callback?next=%2Fapp",
    );
  });
});
