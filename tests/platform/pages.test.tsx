import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue, AuthSnapshot } from "../../src/integration/contracts";
import Landing from "../../src/pages/LandingPage";
import Login from "../../src/pages/LoginPage";
import Signup from "../../src/pages/SignupPage";
import Verify from "../../src/pages/VerifyEmailPage";
import Forgot from "../../src/pages/ForgotPasswordPage";
import Reset from "../../src/pages/ResetPasswordPage";
import Callback from "../../src/pages/AuthCallbackPage";
import Dashboard from "../../src/pages/DashboardPage";
import Account from "../../src/pages/AccountPage";
import NotFound from "../../src/pages/NotFoundPage";
import { workspaceDestination } from "../../src/components/platform/navigation";

const context = vi.hoisted(() => ({ value: null as AuthContextValue | null }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => context.value }));
function Destination() { const l = useLocation(); return <output data-testid="destination">{l.pathname}{l.search}</output>; }
function show(Component: React.ComponentType, path = "/test") {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><Routes><Route path={path.split("?")[0]} element={<Component />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter></StrictMode>);
}
function input(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function submit(name: string) { fireEvent.submit(screen.getByRole("form", { name })); }
function authenticated() { context.value!.state = { status: "authenticated", user: { id: "test-user", email: "person@example.test", displayName: "Sam Lee" }, recoveryAllowed: false }; }
beforeEach(() => {
  context.value = { state: { status: "anonymous", user: null, recoveryAllowed: false }, actions: {
    signIn: vi.fn().mockResolvedValue(undefined), signUp: vi.fn().mockResolvedValue(undefined), signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined), resendVerification: vi.fn().mockResolvedValue(undefined),
    completeCallback: vi.fn().mockResolvedValue("/app"), updatePassword: vi.fn().mockResolvedValue(undefined), updateDisplayName: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined), retrySession: vi.fn().mockResolvedValue(undefined),
  } };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("soft platform screens", () => {
  it("has a real static landing preview, valid CTAs, heading focus and no canvas", () => {
    show(Landing, "/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Explore molecular structures.With clarity.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(document.title).toBe("Explore molecular structures · BioFold 3D");
    expect(screen.getByRole("img", { name: /^Actual BioFold view of 4HHB/ })).toHaveAttribute("src", "/4hhb-preview.png");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
    expect(document.querySelector("canvas")).toBeNull();
  });
  it.each(["loading", "unconfigured", "error"] as AuthSnapshot["status"][])("locks real sign-in actions while auth is %s", status => {
    context.value!.state.status = status;
    show(Login);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    submit("Sign in");
    expect(context.value!.actions.signIn).not.toHaveBeenCalled();
  });
  it("validates fields accessibly before contacting auth", () => {
    show(Login);
    input("Email address", "invalid");
    submit("Sign in");
    expect(screen.getByLabelText("Email address", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid email address.")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Email address", { exact: true })).toHaveFocus();
    expect(context.value!.actions.signIn).not.toHaveBeenCalled();
  });
  it("signs in with exact credentials and returns to the normalized lab deep link", async () => {
    show(Login, "/login?next=%2Fapp%2Flab%3Fpdb%3D4hhb");
    input("Email address", "sam@example.test"); input("Password", "valid-password"); submit("Sign in");
    expect(await screen.findByTestId("destination")).toHaveTextContent("/app/lab?pdb=4HHB");
    expect(context.value!.actions.signIn).toHaveBeenCalledWith("sam@example.test", "valid-password");
  });
  it("keeps a failed login on screen with persistent feedback", async () => {
    vi.mocked(context.value!.actions.signIn).mockRejectedValue(new Error("Incorrect email or password."));
    show(Login); input("Email address", "sam@example.test"); input("Password", "wrong-password"); submit("Sign in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.queryByTestId("destination")).toBeNull();
  });
  it("prevents duplicate submissions and does not navigate after an unmount", async () => {
    let finish!: () => void;
    vi.mocked(context.value!.actions.signIn).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const view = show(Login); input("Email address", "sam@example.test"); input("Password", "valid-password"); submit("Sign in"); submit("Sign in");
    expect(context.value!.actions.signIn).toHaveBeenCalledOnce();
    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true");
    view.unmount(); await act(async () => finish());
    expect(screen.queryByTestId("destination")).toBeNull();
  });
  it("passes only an internal destination to Google", async () => {
    show(Login, "/login?next=https%3A%2F%2Fevil.test");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(context.value!.actions.signInWithGoogle).toHaveBeenCalledWith("/app"));
  });
  it("creates an account and sends email to verification via navigation state, not URL", async () => {
    show(Signup); input("Full name", "Sam Lee"); input("Email address", "sam@example.test"); input("Password", "unique-password"); submit("Create account");
    expect(context.value!.actions.signUp).toHaveBeenCalledWith({ displayName: "Sam Lee", email: "sam@example.test", password: "unique-password" });
    expect(await screen.findByTestId("destination")).toHaveTextContent("/verify-email");
    expect(screen.getByTestId("destination")).not.toHaveTextContent("sam@example");
  });
  it("supports password reveal without changing form value", () => {
    show(Signup); input("Password", "test-password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password", { exact: true })).toHaveValue("test-password");
  });
  it("resends verification only after a real action succeeds", async () => {
    show(Verify); input("Email address", "sam@example.test"); submit("Resend confirmation");
    expect(await screen.findByRole("status")).toHaveTextContent("Confirmation requested");
    expect(context.value!.actions.resendVerification).toHaveBeenCalledWith("sam@example.test");
  });
  it("uses a neutral password-recovery confirmation", async () => {
    show(Forgot); input("Email address", "sam@example.test"); submit("Password recovery");
    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists");
  });
  it("requires validated recovery and matching passwords", async () => {
    const page = show(Reset);
    expect(screen.queryByRole("form")).toBeNull();
    page.unmount(); context.value!.state.recoveryAllowed = true; show(Reset);
    input("New password", "new-password"); input("Confirm new password", "different"); submit("Set new password");
    expect(screen.getByText("Passwords do not match.")).toBeVisible();
    expect(context.value!.actions.updatePassword).not.toHaveBeenCalled();
    input("Confirm new password", "new-password"); submit("Set new password");
    expect(await screen.findByTestId("destination")).toHaveTextContent("/app");
  });
  it("processes a callback once even under effect replay", async () => {
    show(Callback, "/auth/callback?code=example");
    expect(await screen.findByTestId("destination")).toHaveTextContent("/app");
    expect(context.value!.actions.completeCallback).toHaveBeenCalledOnce();
  });
  it("does not expose sensitive callback failures", async () => {
    vi.mocked(context.value!.actions.completeCallback).mockRejectedValue(new Error("token=SECRET"));
    show(Callback); expect(await screen.findByRole("alert")).toHaveTextContent("This link could not be verified");
    expect(document.body.textContent).not.toContain("SECRET");
  });
  it("offers examples and explains saved versus unsaved work", () => {
    authenticated(); show(Dashboard);
    expect(screen.getByText("Welcome, Sam Lee")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open laboratory" })).toHaveAttribute("href", "/app/lab");
    expect(screen.getByRole("link", { name: "Explore 4HHB" })).toHaveAttribute("href", "/app/lab?pdb=4HHB");
    expect(screen.getByText(/Saved projects can be reopened after a reload/)).toBeVisible();
    expect(screen.getByText(/signing out always clears the active 3D scene/)).toBeVisible();
  });
  it("updates the name, keeps email read-only, and reports logout errors", async () => {
    authenticated(); vi.mocked(context.value!.actions.signOut).mockRejectedValue(new Error("Sign out failed. Please retry."));
    show(Account); expect(screen.getByLabelText("Email address", { exact: true })).toHaveAttribute("readonly");
    input("Full name", "Sam Updated"); submit("Profile details");
    expect(await screen.findByRole("status")).toHaveTextContent("Your profile has been updated");
    expect(context.value!.actions.updateDisplayName).toHaveBeenCalledWith("Sam Updated");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed");
  });
  it("provides a useful unknown-route screen", () => { show(NotFound); expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/"); });
});

describe("workspace return allowlist", () => {
  it.each(["https://evil.test/app", "//evil.test", "/app\\evil", "/app/../login", "/app-extra", "/app\n", "/login", null])("rejects %s", value => expect(workspaceDestination(value)).toBe("/app"));
  it.each([["/app/account?token=secret", "/app/account"], ["/app/lab?pdb=1crn&token=secret", "/app/lab?pdb=1CRN"], ["/app/lab?pdb=invalid", "/app/lab"]])("normalizes %s", (value, expected) => expect(workspaceDestination(value)).toBe(expected));
});
