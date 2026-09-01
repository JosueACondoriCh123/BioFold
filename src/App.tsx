import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { WorkspaceNav } from "./components/platform/PlatformLayout";
import { workspaceSession } from "./core/workspaceSession";
import type { AuthContextValue, PlatformPages } from "./integration/contracts";
import { ErrorBoundary } from "./integration/ErrorBoundary";
import { IntegrationStatus } from "./integration/IntegrationStatus";
import "./integration/integration.css";
import "./platform.css";

const Laboratory = lazy(() => import("./Laboratory"));

function RecoveryGate({ auth, children }: { auth: AuthContextValue; children: ReactNode }) {
  const { state } = auth;
  const validUser = state.status === "authenticated" ? state.user?.id ?? null : null;
  const [admittedUser, setAdmittedUser] = useState<string | null>(null);
  useEffect(() => {
    if (validUser && state.recoveryAllowed) setAdmittedUser(validUser);
    else if (!validUser || validUser !== admittedUser) setAdmittedUser(null);
  }, [validUser, state.recoveryAllowed, admittedUser]);
  if (state.status === "loading") return <IntegrationStatus title="Checking your recovery link" message="Please wait while your session is verified." />;
  // Keep the already-validated page mounted long enough for its successful
  // update action to navigate. The page still gates its form on recoveryAllowed.
  if (validUser && (state.recoveryAllowed || admittedUser === validUser)) return children;
  return <IntegrationStatus title="Recovery link required" message="Request a new password reset email, then open its link to continue." recovery />;
}

function LaboratorySession({ active }: { active: boolean }) {
  const [started, setStarted] = useState(false);
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("pdb");
  const validRequest = requested && /^[a-z0-9]{4}$/i.test(requested) ? requested.toUpperCase() : undefined;
  const pdbId = validRequest ?? "1CRN";
  useEffect(() => { if (active) setStarted(true); }, [active]);
  if (!started) return null;
  return <div hidden={!active} inert={!active} aria-hidden={!active} data-testid="laboratory-session">
    <Suspense fallback={<IntegrationStatus title="Preparing the laboratory" message="Loading the 3D viewer…" />}>
      <Laboratory active={active} initialPdbId={pdbId}
        requestKey={active && validRequest ? `${location.key}:${pdbId}` : "initial"} />
    </Suspense>
  </div>;
}

/** Router accepts a typed auth snapshot; it never imports or implements Supabase. */
export default function App({ auth, pages }: { auth: AuthContextValue; pages: PlatformPages }) {
  const location = useLocation();
  const { state, actions } = auth;
  const userId = state.status === "authenticated" && !state.recoveryAllowed ? state.user?.id ?? null : null;
  const laboratoryActive = Boolean(userId) && location.pathname.replace(/\/$/, "") === "/app/lab";

  useLayoutEffect(() => {
    workspaceSession.setContext(userId, laboratoryActive);
  }, [userId, laboratoryActive]);
  useLayoutEffect(() => () => workspaceSession.setContext(null, false), []);
  useEffect(() => {
    if (!laboratoryActive) window.scrollTo(0, 0);
  }, [location.pathname, laboratoryActive]);

  const protect = (content: ReactNode) => {
    if (state.status === "loading") return <IntegrationStatus title="Checking your session" message="Please wait while your account is verified." />;
    if (state.status === "unconfigured") return <IntegrationStatus title="Authentication is not configured" message="Connect the Supabase project before opening the laboratory. No guest access is enabled." />;
    if (state.status === "error") return <IntegrationStatus title="Session unavailable" message={state.error ?? "Your session could not be verified."} retry={() => { void actions.retrySession().catch(() => undefined); }} />;
    if (state.recoveryAllowed) return <Navigate to="/reset-password" replace />;
    if (!userId) {
      const next = location.pathname + location.search;
      return <Navigate to={`/login?next=${encodeURIComponent(next)}`} state={{ returnTo: next }} replace />;
    }
    return content;
  };

  const { LandingPage, LoginPage, SignupPage, VerifyEmailPage, ForgotPasswordPage,
    AuthCallbackPage, ResetPasswordPage, DashboardPage, AccountPage, NotFoundPage } = pages;

  return <ErrorBoundary>
    {userId && location.pathname.startsWith("/app") && !laboratoryActive && <div className="platform-root"><WorkspaceNav /></div>}
    <Suspense fallback={<IntegrationStatus title="Loading screen" message="Please wait…" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<RecoveryGate auth={auth}><ResetPasswordPage /></RecoveryGate>} />
        <Route path="/app" element={protect(<DashboardPage />)} />
        <Route path="/app/lab" element={protect(null)} />
        <Route path="/app/account" element={protect(<AccountPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    {userId && <LaboratorySession key={userId} active={laboratoryActive} />}
  </ErrorBoundary>;
}
