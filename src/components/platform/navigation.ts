/** UI allowlist; auth must independently validate destinations at its trust boundary. */
export function workspaceDestination(value: unknown): string {
  if (typeof value !== "string" || !/^\/app(?:\/lab|\/account|\/vision)?\/?(?:\?|$)/.test(value)
    || value.includes("\\") || Array.from(value).some(char => char.charCodeAt(0) <= 32)) return "/app";
  try {
    const url = new URL(value, "https://biofold.invalid");
    const path = url.pathname.replace(/\/$/, "");
    if (!["/app", "/app/lab", "/app/account", "/app/vision"].includes(path)) return "/app";
    const pdb = url.searchParams.get("pdb");
    return path === "/app/lab" && pdb && /^[a-z0-9]{4}$/i.test(pdb)
      ? `${path}?pdb=${pdb.toUpperCase()}` : path;
  } catch { return "/app"; }
}
