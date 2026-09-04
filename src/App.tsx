import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { WorkspaceNav } from "./components/platform/PlatformLayout";
import { workspaceSession } from "./core/workspaceSession";
import type { AuthContextValue, PlatformPages } from "./integration/contracts";
import { ErrorBoundary } from "./integration/ErrorBoundary";
import { IntegrationStatus } from "./integration/IntegrationStatus";
import { getProjectDataPort } from "./data";
import type { ProjectDataPort } from "./types/projects";
import "./integration/integration.css";
import "./platform.css";

const Laboratory = lazy(() => import("./Laboratory"));
const DefaultVisionStudioPage = lazy(() => import("./pages/VisionStudioPage"));
const SharedProjectPage = lazy(() => import("./pages/SharedProjectPage"));

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

function LaboratorySession({ active, projectDataPort }: { active: boolean; projectDataPort: ProjectDataPort | null }) {
  const [started, setStarted] = useState(false);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | undefined>(undefined);
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const requested = search.get("pdb");
  const requestedProject = search.get("project");
  const validRequest =
    requested && (/^[a-z0-9]{4}$/i.test(requested) || /^AF-[a-z0-9_-]+$/i.test(requested) || /^[a-z0-9]{6,10}$/i.test(requested))
      ? requested.toUpperCase()
      : undefined;
  const validProject = requestedProject && /^[a-z0-9-]{1,128}$/i.test(requestedProject) ? requestedProject : undefined;
  const pdbId = validRequest ?? "1CRN";

  useEffect(() => { if (active) setStarted(true); }, [active]);

  useEffect(() => {
    if (!active || !projectDataPort) return;
    if (validProject) {
      setResolvedProjectId(validProject);
      return;
    }
    let cancelled = false;
    async function resolveDefaultProject() {
      try {
        const list = await projectDataPort!.listProjects();
        if (cancelled) return;
        if (list.ok && list.data.length > 0) {
          setResolvedProjectId(list.data[0].id);
        } else if (list.ok) {
          const created = await projectDataPort!.createProject({
            title: "Primary Research Workspace",
            description: "Default molecular research workspace",
          });
          if (!cancelled && created.ok) {
            setResolvedProjectId(created.data.id);
          }
        }
      } catch {
        /* graceful fallback */
      }
    }
    void resolveDefaultProject();
    return () => {
      cancelled = true;
    };
  }, [active, projectDataPort, validProject]);

  const activeProjectId = validProject ?? resolvedProjectId;

  if (!started) return null;
  return <div hidden={!active} inert={!active} aria-hidden={!active} data-testid="laboratory-session">
    <Suspense fallback={<IntegrationStatus title="Preparing the laboratory" message="Loading the 3D viewer…" />}>
      <Laboratory active={active} initialPdbId={pdbId}
        projectId={activeProjectId}
        projectDataPort={projectDataPort ?? undefined}
        requestKey={active && (validRequest || activeProjectId) ? `${location.key}:${activeProjectId ?? "workspace"}:${pdbId}` : "initial"} />
    </Suspense>
  </div>;
}

/** Router accepts a typed auth snapshot; it never imports or implements Supabase. */
export default function App({ auth, pages }: { auth: AuthContextValue; pages: PlatformPages }) {
  const location = useLocation();
  const { state, actions } = auth;
  const userId = state.status === "authenticated" && !state.recoveryAllowed ? state.user?.id ?? null : null;
  const projectDataPort = useMemo(() => userId ? getProjectDataPort(userId) : null, [userId]);
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
  const VisionStudioPage = pages.VisionStudioPage ?? DefaultVisionStudioPage;

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
        <Route path="/app/vision" element={protect(<VisionStudioPage />)} />
        <Route path="/app/account" element={protect(<AccountPage />)} />
        <Route path="/share/:shareToken" element={<SharedProjectPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    {userId && <LaboratorySession key={userId} active={laboratoryActive} projectDataPort={projectDataPort} />}
  </ErrorBoundary>;
}
