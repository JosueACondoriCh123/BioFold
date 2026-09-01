import type { AuthSnapshot } from "../../integration/contracts";

export function authFormBlocked(state: AuthSnapshot) {
  return ["loading", "unconfigured", "error"].includes(state.status);
}

export function emailFromNavigation(value: unknown) {
  if (!value || typeof value !== "object" || !("email" in value)) return "";
  return typeof value.email === "string" && value.email.length <= 254 ? value.email : "";
}
