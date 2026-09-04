import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { PLATFORM_URL, LAB_FIXTURE_URL, UNCONFIGURED_URL } from "./tests/config/e2eEnvironment";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["webmcpNative.spec.ts", "webmcpUnavailable.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-summary.json" }]],
  use: {
    baseURL: PLATFORM_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
  webServer: [{
    command: "pnpm run test:platform:serve",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: PLATFORM_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: "pnpm run test:lab:serve",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: LAB_FIXTURE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: "pnpm run test:unconfigured:serve",
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: UNCONFIGURED_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  }],
});
