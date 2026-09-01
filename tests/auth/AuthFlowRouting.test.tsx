import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import App from "../../src/App";
import { AuthProvider } from "../../src/auth/AuthProvider";
import { useAuth } from "../../src/auth/useAuth";
import { SupabaseAuthAdapter } from "../../src/auth/supabaseAuthAdapter";
import type { PlatformPages } from "../../src/integration/contracts";
import ResetPasswordPage from "../../src/pages/ResetPasswordPage";
import AuthCallbackPage from "../../src/pages/AuthCallbackPage";
import SignupPage from "../../src/pages/SignupPage";
import VerifyEmailPage from "../../src/pages/VerifyEmailPage";
import { createMockSession, createMockSupabaseAuth, createMockUser, setTestUrl } from "../helpers/auth/mockSupabase";

vi.mock("../../src/Laboratory", () => ({ default: () => <div>Laboratory fixture</div> }));
function Destination() { const location = useLocation(); return <output>{location.pathname}{location.state?.passwordUpdated ? " · Password updated" : ""}</output>; }
const pages = Object.fromEntries(["LandingPage", "LoginPage", "SignupPage", "VerifyEmailPage", "ForgotPasswordPage", "AuthCallbackPage", "ResetPasswordPage", "DashboardPage", "AccountPage", "NotFoundPage"].map(key => [key, Destination])) as unknown as PlatformPages;
function Platform() { const auth = useAuth(); return <App auth={auth} pages={{ ...pages, AuthCallbackPage, ResetPasswordPage, SignupPage, VerifyEmailPage }} />; }
beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); setTestUrl("/"); vi.restoreAllMocks(); });

describe("auth and real page routing", () => {
  it("completes a recovery callback and password update without unmounting before success navigation", async () => {
    const mock = createMockSupabaseAuth();
    mock.mockExchangeCodeForSession.mockResolvedValue({ data: { session: createMockSession(), user: createMockUser(), redirectType: "recovery" }, error: null });
    setTestUrl("/auth/callback?code=test-code");
    render(<StrictMode><MemoryRouter initialEntries={["/auth/callback?code=test-code"]}><AuthProvider adapter={new SupabaseAuthAdapter(() => mock.client)}><Platform /></AuthProvider></MemoryRouter></StrictMode>);
    await screen.findByRole("heading", { name: "Choose a new password." });
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password", { exact: true }), { target: { value: "new-password-123" } });
    fireEvent.submit(screen.getByRole("form", { name: "Set new password" }));
    await screen.findByText("/app · Password updated");
    expect(mock.mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mock.mockUpdateUser).toHaveBeenCalledTimes(1);
  });
  it("goes to the workspace when signup returns an immediate authenticated session", async () => {
    const mock = createMockSupabaseAuth({ initialSession: null });
    mock.mockSignUp.mockResolvedValue({ data: { session: createMockSession(), user: createMockUser() }, error: null });
    render(<MemoryRouter initialEntries={["/signup"]}><AuthProvider adapter={new SupabaseAuthAdapter(() => mock.client)}><Platform /></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText("Full name", { exact: true })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Full name", { exact: true }), { target: { value: "Test researcher" } });
    fireEvent.change(screen.getByLabelText("Email address", { exact: true }), { target: { value: "researcher@example.test" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "test-password-123" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create account" }));
    await screen.findByText("/app");
    expect(screen.queryByRole("heading", { name: "Check your inbox." })).not.toBeInTheDocument();
  });
});
