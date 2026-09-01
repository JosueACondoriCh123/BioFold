import { expect, test } from "@playwright/test";
import { UNCONFIGURED_URL } from "../config/e2eEnvironment";

test.use({ baseURL: UNCONFIGURED_URL });

test("missing configuration is explicit and never attempts auth or guest login", async ({ page }) => {
  const authRequests: string[] = [];
  await page.route("**/auth/v1/**", async route => { authRequests.push(route.request().url()); await route.abort(); });
  await page.goto("/login");
  await expect(page.getByRole("status")).toContainText("Authentication is not configured.");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  await page.goto("/app/lab");
  await expect(page.getByRole("heading", { name: "Authentication is not configured" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No guest access is enabled.");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(authRequests).toEqual([]);
});
