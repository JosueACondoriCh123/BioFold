import { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import App from "../../src/App";
import { AuthContext } from "../../src/auth/AuthContext";
import type { AuthContextValue as ProviderContextValue } from "../../src/auth/AuthContext";
import { PAGE_NAMES, type AuthContextValue, type AuthSnapshot, type PlatformPages } from "../../src/integration/contracts";

// This entry is built only by vite.e2e.config.ts, never by the production build.
// It verifies visual/component integration, not Supabase authentication.
const modules = import.meta.glob<Record<string, unknown>>("../../src/pages/*.tsx");
const pages = Object.fromEntries(PAGE_NAMES.map(name => [name, lazy(async () => {
  const module = await modules[`../../src/pages/${name}.tsx`]();
  return { default: module.default as () => React.JSX.Element };
})])) as unknown as PlatformPages;
const screen = new URLSearchParams(window.location.search).get("screen") ?? "/";
const user = { id: "visual-fixture-user", email: "researcher@example.test", displayName: "Demo Researcher" };

export function VisualFixture() {
  const [state, setState] = useState<AuthSnapshot>({ status: screen.startsWith("/app") ? "authenticated" : "anonymous", user: screen.startsWith("/app") ? user : null, recoveryAllowed: screen === "/reset-password" });
  const noop = async () => undefined;
  const auth: AuthContextValue = { state, actions: {
    signIn: async () => setState({ status: "authenticated", user, recoveryAllowed: false }),
    signUp: noop, signInWithGoogle: async () => { throw new Error("Google is not connected in this visual test fixture."); },
    requestPasswordReset: noop, resendVerification: noop, completeCallback: async () => { throw new Error("No valid callback in the visual fixture."); },
    updatePassword: async () => setState({ status: "authenticated", user, recoveryAllowed: false }),
    updateDisplayName: async displayName => setState(previous => ({ ...previous, user: { ...user, displayName } })),
    signOut: async () => setState({ status: "anonymous", user: null, recoveryAllowed: false }), retrySession: noop,
  } };
  return <AuthContext.Provider value={auth as ProviderContextValue}><App auth={auth} pages={pages} /></AuthContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={[screen]}><Suspense fallback={<p>Loading visual fixture…</p>}><VisualFixture /></Suspense></MemoryRouter>);
