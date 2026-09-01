import { expect, test as base, type Page } from "@playwright/test";
import { assertNoMolecularRuntime, attachWebMcpInspector, setupMockSupabaseNetwork, TEST_EMAIL, TEST_PASSWORD, TEST_NAME } from "../helpers/platform";
import { PLATFORM_URL } from "../config/e2eEnvironment";

type AuthServer = Awaited<ReturnType<typeof setupMockSupabaseNetwork>>;
const test = base.extend<{ auth: AuthServer }>({
  auth: [async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await attachWebMcpInspector(page);
    const auth = await setupMockSupabaseNetwork(page);
    await use(auth);
    expect(auth.unexpected, "Every auth request must be handled by the isolated mock").toEqual([]);
    expect(pageErrors, "No uncaught page exceptions").toEqual([]);
  }, { auto: true }],
});

async function signIn(page: Page, password = TEST_PASSWORD, email = TEST_EMAIL) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Full name", { exact: true }).fill(TEST_NAME);
  await page.getByLabel("Email address", { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
}
async function requestRecovery(page: Page, email = TEST_EMAIL) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/password reset link/i);
}
async function setPassword(page: Page, password: string) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
}
async function expectCallbackRejected(page: Page) {
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a password reset" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password", exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  expect(new URL(page.url()).hash).toBe("");
  await assertNoMolecularRuntime(page);
}

test("landing is public and does not load WebGL, workers or WebMCP", async ({ page }) => {
  const runtime: string[] = [];
  page.on("request", request => { if (/Laboratory[-.]|geometry\.worker|3Dmol/i.test(request.url())) runtime.push(request.url()); });
  page.on("worker", worker => runtime.push(worker.url()));
  await page.goto("/");
  await expect(page).toHaveTitle(/Explore molecular structures · BioFold 3D/i);
  await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
  await assertNoMolecularRuntime(page);
  expect(runtime).toEqual([]);
});

test("public navigation reaches login and signup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await page.getByRole("link", { name: "Create account", exact: true }).last().click();
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
});

for (const path of ["/app", "/app/account", "/app/lab?pdb=4HHB"]) {
  test(`private deep link ${path} returns safely through login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(`${PLATFORM_URL}/login?next=${encodeURIComponent(path)}`);
    await assertNoMolecularRuntime(page);
  });
}

test("password login returns to requested laboratory and survives a deep-link reload", async ({ page, auth }) => {
  await page.goto("/app/lab?pdb=4HHB");
  await signIn(page);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app/lab?pdb=4HHB`);
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB", { timeout: 25_000 });
  await page.reload();
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB", { timeout: 25_000 });
  expect(auth.count("user", "GET")).toBeGreaterThan(0);
  expect(auth.requests.filter(request => request.url.searchParams.get("grant_type") === "password")).toHaveLength(1);
});

test("invalid credentials produce an actionable error without opening the workspace", async ({ page, auth }) => {
  await page.goto("/login");
  await signIn(page, "Wrong-password!");
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password.");
  await expect(page).toHaveURL(`${PLATFORM_URL}/login`);
  expect(auth.count("token")).toBe(1);
  await assertNoMolecularRuntime(page);
});

test("pending login disables duplicate submissions and restores controls after failure", async ({ page, auth }) => {
  const release = auth.hold("password");
  auth.failures.password = { status: 400, code: "invalid_credentials", message: "Invalid login credentials" };
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Signing in…", exact: true })).toBeDisabled();
  await expect(page.getByRole("form", { name: "Sign in" })).toHaveAttribute("aria-busy", "true");
  expect(auth.count("token")).toBe(1);
  release();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("login rejects an external return URL", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Funtrusted.example%2F");
  await signIn(page);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
});

test("initial signup confirmation establishes a normal session, not recovery permission", async ({ page, auth }) => {
  await signUp(page);
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto(auth.lastLink("signup").url);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
  await expect(page.getByText(`Welcome, ${TEST_NAME}`, { exact: true })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Recovery link required" })).toBeVisible();
  expect(auth.requests.filter(request => request.url.searchParams.get("grant_type") === "pkce")).toHaveLength(1);
});

test("signup, resend and PKCE confirmation establish a usable session exactly once", async ({ page, auth }) => {
  await signUp(page);
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(TEST_EMAIL);
  await page.getByRole("button", { name: "Resend confirmation" }).click();
  await expect(page.getByRole("status")).toContainText("Confirmation requested");
  expect(auth.count("signup")).toBe(1);
  expect(auth.count("resend")).toBe(1);
  const link = auth.lastLink("signup");
  expect(link.challenge).not.toBe(auth.links[0].challenge);
  await page.goto(link.url);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
  await expect(page.getByText(`Welcome, ${TEST_NAME}`, { exact: true })).toBeVisible();
  expect(link.used).toBe(true);
  expect(auth.requests.filter(request => request.url.searchParams.get("grant_type") === "pkce")).toHaveLength(1);
  await page.goto("/app/account");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(TEST_EMAIL);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app/account`);
});

test("signup failure is not presented as successful confirmation", async ({ page, auth }) => {
  auth.failures.signup = { status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" };
  await signUp(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(`${PLATFORM_URL}/signup`);
  expect(auth.links).toHaveLength(0);
});

test("unconfirmed signup cannot sign in before confirmation", async ({ page }) => {
  await signUp(page);
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText(/confirm|verified/i);
  await assertNoMolecularRuntime(page);
});

for (const email of [TEST_EMAIL, "unknown@example.test"]) {
  test(`password-reset request gives a neutral response for ${email}`, async ({ page, auth }) => {
    await requestRecovery(page, email);
    expect(auth.count("recover")).toBe(1);
    expect(auth.links).toHaveLength(email === TEST_EMAIL ? 1 : 0);
  });
}

test("failed recovery request shows an error, not email-delivery success, and can retry", async ({ page, auth }) => {
  auth.failures.recover = { status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" };
  await page.goto("/forgot-password");
  await page.getByLabel("Email address", { exact: true }).fill(TEST_EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(auth.links).toHaveLength(0);
  delete auth.failures.recover;
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/password reset link/i);
  expect(auth.count("recover")).toBe(2);
  expect(auth.links).toHaveLength(1);
});

test("PKCE recovery updates password, accepts the new password and rejects the old one", async ({ page, auth }) => {
  await requestRecovery(page);
  const link = auth.lastLink("recovery");
  // No editable type=recovery marker: the SDK's actual recovery verifier is used.
  expect(new URL(link.url).searchParams.has("type")).toBe(false);
  await page.goto(link.url);
  await expect(page).toHaveURL(`${PLATFORM_URL}/reset-password`);
  await expect(page.getByRole("heading", { name: "Choose a new password." })).toBeVisible();
  await assertNoMolecularRuntime(page);
  const updatedPassword = "Changed-through-recovery-456!";
  await setPassword(page, updatedPassword);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
  await expect(page.getByRole("status").filter({ hasText: /password.*updated/i })).toBeVisible();
  expect(auth.requests.filter(request => request.method === "PUT").map(request => request.body.password)).toEqual([updatedPassword]);
  expect(auth.requests.filter(request => request.url.searchParams.get("grant_type") === "pkce")).toHaveLength(1);
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Recovery link required" })).toBeVisible();
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, TEST_PASSWORD);
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password.");
  await signIn(page, updatedPassword);
  await expect(page).toHaveURL(`${PLATFORM_URL}/app/account`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your account." })).toBeVisible();
});

test("recovery validates confirmation, retains permission after server failure and permits retry", async ({ page, auth }) => {
  await requestRecovery(page);
  await page.goto(auth.lastLink("recovery").url);
  await expect(page).toHaveURL(`${PLATFORM_URL}/reset-password`);
  await page.getByLabel("New password", { exact: true }).fill("Changed-password-123!");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Different-password-123!");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByLabel("Confirm new password", { exact: true })).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Passwords do not match.");
  expect(auth.count("user", "PUT")).toBe(0);
  auth.failures.update = { status: 422, code: "weak_password", message: "Password is too weak" };
  await setPassword(page, "Changed-password-123!");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password", exact: true })).toBeEnabled();
  delete auth.failures.update;
  await setPassword(page, "Stronger-changed-password-456!");
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
  expect(auth.count("user", "PUT")).toBe(2);
});

for (const kind of ["signup", "recovery"] as const) {
  test(`expired ${kind} link fails visibly and cannot open a password form`, async ({ page, auth }) => {
    if (kind === "signup") { await signUp(page); await expect(page).toHaveURL(/\/verify-email/); }
    else await requestRecovery(page);
    const link = auth.lastLink(kind);
    link.expired = true;
    await page.goto(link.url);
    await expectCallbackRejected(page);
    expect(auth.count("user", "PUT")).toBe(0);
  });
}

test("used recovery code cannot authorize another password change", async ({ page, auth }) => {
  await requestRecovery(page);
  const usedLink = auth.lastLink("recovery");
  await page.goto(usedLink.url);
  await expect(page).toHaveURL(`${PLATFORM_URL}/reset-password`);
  await setPassword(page, "Changed-password-123!");
  await expect(page).toHaveURL(`${PLATFORM_URL}/app`);
  // A new recovery generates a valid verifier, but replaying the old code still fails.
  await requestRecovery(page);
  await page.goto(usedLink.url);
  await expectCallbackRejected(page);
  expect(auth.count("user", "PUT")).toBe(1);
});

test("recovery link without this browser's verifier is rejected", async ({ page, auth }) => {
  await requestRecovery(page);
  await page.evaluate(() => localStorage.removeItem("biofold-auth-token-code-verifier"));
  await page.goto(auth.lastLink("recovery").url);
  await expectCallbackRejected(page);
  expect(auth.count("user", "PUT")).toBe(0);
});

for (const authenticated of [false, true]) {
  test(`direct reset access is blocked (${authenticated ? "normal session" : "anonymous"})`, async ({ page, auth }) => {
    if (authenticated) await auth.seedSession();
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Recovery link required" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password", exact: true })).toHaveCount(0);
    expect(auth.count("user", "PUT")).toBe(0);
  });
}

for (const suffix of ["#access_token=forged-e2e-token&refresh_token=forged&type=recovery", "?type=recovery"]) {
  test(`URL text alone cannot grant recovery: ${suffix.split("=")[0]}`, async ({ page, auth }) => {
    await page.goto(`/auth/callback${suffix}`);
    await expectCallbackRejected(page);
    expect(auth.count("token")).toBe(0);
    expect(auth.count("user", "PUT")).toBe(0);
  });
}

test("Google button starts S256 identity-only OAuth and processes its simulated callback", async ({ page, auth }) => {
  await page.goto("/login?next=%2Fapp%2Faccount");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(`${PLATFORM_URL}/app/account`);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(TEST_NAME);
  const authorize = auth.requests.find(request => request.url.pathname.endsWith("/authorize"))!;
  expect(authorize.url.searchParams.get("scopes")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  expect(authorize.url.searchParams.has("access_type")).toBe(false);
  expect(auth.lastLink("google").used).toBe(true);
  expect(auth.requests.filter(request => request.url.searchParams.get("grant_type") === "pkce")).toHaveLength(1);
});

test("denied OAuth callback displays recovery actions and removes URL credentials", async ({ page }) => {
  await page.goto("/auth/callback#error=access_denied&error_description=attacker-supplied-text");
  await expectCallbackRejected(page);
  await expect(page.locator("body")).not.toContainText("attacker-supplied-text");
});

test("account persists the updated name after an SDK-verified reload", async ({ page, auth }) => {
  await auth.seedSession();
  await page.goto("/app/account");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(TEST_NAME);
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("Full name", { exact: true }).fill("Updated Researcher");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Your profile has been updated.");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Updated Researcher");
  expect(auth.count("user", "PUT")).toBe(1);
  expect(auth.count("user", "GET")).toBeGreaterThanOrEqual(2);
});

test("failed profile save retains the server name and allows retry", async ({ page, auth }) => {
  await auth.seedSession();
  auth.failures.update = { status: 422, code: "validation_failed", message: "Profile update failed" };
  await page.goto("/app/account");
  await page.getByLabel("Full name", { exact: true }).fill("Unsaved Researcher");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(TEST_NAME);
});

test("a saved project restores its molecular scene and audit trail after reload", async ({ page, auth }) => {
  test.setTimeout(90_000);
  await auth.seedSession();
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "No projects" })).toBeVisible();
  await page.getByRole("button", { name: "Create your first project" }).click();
  await page.getByLabel("Project title").fill("Hemoglobin workspace");
  await page.getByLabel("Initial PDB ID").fill("4HHB");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByText("Hemoglobin workspace", { exact: true })).toBeVisible();
  await expect(page.getByLabel("PDB Structure: 4HHB")).toBeVisible();

  await page.getByRole("button", { name: "Open project Hemoglobin workspace in laboratory" }).click();
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB", { timeout: 25_000 });
  await page.getByRole("button", { name: "Stick", exact: true }).click();
  await page.getByRole("button", { name: "Spectrum", exact: true }).click();
  await page.getByRole("button", { name: "Measure distance", exact: true }).click();
  await expect(page.locator(".result-value")).toContainText("Å");
  const measuredDistance = Number.parseFloat(await page.locator(".result-value").innerText());
  expect(measuredDistance).toBeGreaterThan(0);
  await expect(page.getByRole("status", { name: "Storage status: saved" })).toBeVisible();
  const savedSnapshot = auth.projects[0].snapshot as { view?: { representation?: string; colorScheme?: string }; measurement?: { angstroms?: number } };
  expect(savedSnapshot.view).toMatchObject({ representation: "stick", colorScheme: "spectrum" });
  expect(savedSnapshot.measurement?.angstroms).toBeCloseTo(measuredDistance, 2);
  expect(auth.projectEvents.map(event => event.command)).toEqual(expect.arrayContaining([
    "set_representation",
    "measure_distance",
  ]));

  await page.reload();
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB", { timeout: 25_000 });
  await expect(page.getByRole("button", { name: "Stick", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Spectrum", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".result-value")).toContainText(measuredDistance.toFixed(2));
  await expect(page.locator('.activity-item[data-command="measure_distance"]')).toBeVisible();
});

test("laboratory deactivates eight tools outside its route and preserves results on return", async ({ page, auth }) => {
  await auth.seedSession();
  await page.goto("/app/lab");
  await expect(page.getByText("8 agent tools")).toBeVisible({ timeout: 25_000 });
  // Viewer readiness enables tools before the transactional initial fixture
  // load commits. Wait for that independently observable command result.
  await expect(page.getByText(/1CRN loaded and rendered/i)).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".structure-pill strong")).toHaveText("1CRN");
  await page.getByRole("button", { name: "Stick", exact: true }).click();
  await page.getByRole("button", { name: "Spectrum", exact: true }).click();
  await page.getByRole("button", { name: /Measure distance/i }).click();
  await expect(page.locator(".result-value")).toContainText("12.60");
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.locator("canvas")).toBeHidden();
  expect(await page.evaluate(() => (window as any).__biofoldRegisteredTools.length)).toBe(0);
  await page.getByRole("link", { name: "Laboratory", exact: true }).click();
  await expect(page.getByText("8 agent tools")).toBeVisible();
  await expect(page.locator(".result-value")).toContainText("12.60");
  expect(await page.locator("canvas").evaluate((node, prior) => node === prior, canvas)).toBe(true);
  expect(await page.evaluate(() => (window as any).__biofoldRegisteredTools.length)).toBe(8);
});

test("logout removes persisted session and reload cannot restore it", async ({ page, auth }) => {
  await auth.seedSession();
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("biofold-auth-token"))).toBeNull();
  expect(auth.requests.find(request => request.url.pathname.endsWith("/logout"))?.url.searchParams.get("scope")).toBe("local");
  await page.goto("/app");
  await expect(page).toHaveURL(`${PLATFORM_URL}/login?next=%2Fapp`);
  await assertNoMolecularRuntime(page);
});

test("revoked server session cannot expose private content on reload", async ({ page, auth }) => {
  await auth.seedSession();
  await page.goto("/app/account");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(TEST_NAME);
  auth.expireSessions();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session unavailable" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Your session is no longer valid.");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await assertNoMolecularRuntime(page);
});

test("unknown route offers a functional way home", async ({ page }) => {
  await page.goto("/non-existent-route-404");
  await expect(page.getByRole("heading", { name: "This page is uncharted." })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(`${PLATFORM_URL}/`);
});
