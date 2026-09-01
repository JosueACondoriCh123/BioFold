import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import App from "../src/App";
import { workspaceSession } from "../src/core/workspaceSession";
import type { AuthContextValue, PlatformPages } from "../src/integration/contracts";

const lifecycle = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock("../src/Laboratory", async () => {
  const { useEffect, useState } = await import("react");
  return { default: function Lab() {
    const [count, setCount] = useState(0);
    useEffect(() => { lifecycle.mount(); return () => { lifecycle.unmount(); }; }, []);
    return <div><h1>Test scene</h1><button onClick={() => setCount(count + 1)}>Camera {count}</button></div>;
  } };
});
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
const Page = () => <Location />;
const pages = Object.fromEntries(["LandingPage", "LoginPage", "SignupPage", "VerifyEmailPage", "ForgotPasswordPage", "AuthCallbackPage", "ResetPasswordPage", "DashboardPage", "AccountPage", "NotFoundPage"].map(name => [name, Page])) as unknown as PlatformPages;
function auth(status: AuthContextValue["state"]["status"] = "authenticated", id = "a"): AuthContextValue {
  const noop = async () => undefined;
  return { state: { status, user: status === "authenticated" ? { id, email: "test@example.test", displayName: "Test" } : null, recoveryAllowed: false },
    actions: { signIn: noop, signUp: noop, signInWithGoogle: noop, requestPasswordReset: noop, resendVerification: noop, completeCallback: async () => "/app", updatePassword: noop, updateDisplayName: noop, signOut: noop, retrySession: noop } };
}
beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); lifecycle.mount.mockClear(); lifecycle.unmount.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("redirects a private deep link to login with the internal return destination", async () => {
  render(<MemoryRouter initialEntries={["/app/lab?pdb=4HHB"]}><App auth={auth("anonymous")} pages={pages} /></MemoryRouter>);
  expect(await screen.findByTestId("location")).toHaveTextContent("/login?next=%2Fapp%2Flab%3Fpdb%3D4HHB");
  expect(workspaceSession.getSnapshot().active).toBe(false);
  expect(lifecycle.mount).not.toHaveBeenCalled();
});
it.each(["loading", "unconfigured", "error"] as const)("does not mount a lab in %s state", status => {
  render(<MemoryRouter initialEntries={["/app/lab"]}><App auth={auth(status)} pages={pages} /></MemoryRouter>);
  expect(screen.queryByText("Test scene")).not.toBeInTheDocument();
  expect(workspaceSession.getSnapshot().userId).toBeNull();
});
it("keeps the same mounted lab on navigation and clears it on logout", async () => {
  const value = auth();
  const view = render(<MemoryRouter initialEntries={["/app/lab"]}><App auth={value} pages={pages} /></MemoryRouter>);
  await screen.findByText("Test scene");
  fireEvent.click(screen.getByText("Camera 0"));
  // Re-render at the same router location with a different session: old scene must unmount.
  view.rerender(<MemoryRouter initialEntries={["/app/lab"]}><App auth={auth("anonymous")} pages={pages} /></MemoryRouter>);
  expect(await screen.findByTestId("location")).toHaveTextContent("/login");
  expect(lifecycle.unmount).toHaveBeenCalledOnce();
  expect(screen.queryByText("Camera 1")).not.toBeInTheDocument();
  expect(workspaceSession.getSnapshot().userId).toBeNull();
});
it("never mounts the molecular runtime on the public landing", () => {
  render(<MemoryRouter initialEntries={["/"]}><App auth={auth()} pages={pages} /></MemoryRouter>);
  expect(lifecycle.mount).not.toHaveBeenCalled();
  expect(workspaceSession.getSnapshot().active).toBe(false);
});
it("rejects password-reset routes without validated recovery", () => {
  render(<MemoryRouter initialEntries={["/reset-password"]}><App auth={auth()} pages={pages} /></MemoryRouter>);
  expect(screen.getByText("Recovery link required")).toBeVisible();
});
