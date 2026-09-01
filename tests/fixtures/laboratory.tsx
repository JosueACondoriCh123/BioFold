import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link } from "react-router";
import App from "../../src/App";
import type { AuthContextValue, AuthSnapshot, PlatformPages } from "../../src/integration/contracts";

const firstUser = { id: "fixture-user-a", email: "a@example.test", displayName: "Fixture A" };
const secondUser = { id: "fixture-user-b", email: "b@example.test", displayName: "Fixture B" };
export function Fixture() {
  const [state, setState] = useState<AuthSnapshot>({ status: "authenticated", user: firstUser, recoveryAllowed: false });
  const login = async () => setState({ status: "authenticated", user: firstUser, recoveryAllowed: false });
  const logout = async () => setState({ status: "anonymous", user: null, recoveryAllowed: false });
  const noop = async () => undefined;
  const auth: AuthContextValue = { state, actions: {
    signIn: login, signUp: noop, signInWithGoogle: noop, requestPasswordReset: noop,
    resendVerification: noop, completeCallback: async () => "/app", updatePassword: noop,
    updateDisplayName: noop, signOut: logout, retrySession: noop,
  } };
  const Placeholder = () => <main><h1>Fixture page</h1></main>;
  const pages: PlatformPages = {
    LandingPage: () => <main><h1>Fixture landing</h1><Link to="/app/lab">Open laboratory</Link></main>,
    LoginPage: () => <main><h1>Fixture login</h1><button onClick={() => { void login(); }}>Sign in test user</button><Link to="/app/lab">Open laboratory</Link></main>,
    DashboardPage: () => <main><h1>Fixture dashboard</h1><Link to="/app/lab">Open laboratory</Link><Link to="/app/lab?pdb=4HHB">Open hemoglobin</Link></main>,
    AccountPage: () => <main><h1>Fixture account</h1><button onClick={() => { void logout(); }}>Sign out</button><button onClick={() => setState({ status: "authenticated", user: secondUser, recoveryAllowed: false })}>Switch test user</button></main>,
    SignupPage: Placeholder, VerifyEmailPage: Placeholder, ForgotPasswordPage: Placeholder,
    AuthCallbackPage: Placeholder, ResetPasswordPage: Placeholder, NotFoundPage: Placeholder,
  };
  return <App auth={auth} pages={pages} />;
}

// Test-only observability. This entry is not an input of pnpm build.
Object.assign(window, {
  __biofoldInspect: async () => {
    const { useAppStore } = await import("../../src/store/appStore");
    const { viewerPort } = await import("../../src/adapters/viewerPort");
    return { state: JSON.parse(JSON.stringify(useAppStore.getState())), camera: viewerPort.getView() };
  },
});
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
