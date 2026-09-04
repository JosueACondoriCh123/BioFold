import { defineConfig, devices } from "@playwright/test";
import { LAB_FIXTURE_URL } from "./tests/config/e2eEnvironment";

// Real browser API; only authentication and scientific input data use fixtures.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["webmcpNative.spec.ts", "webmcpUnavailable.spec.ts"],
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: LAB_FIXTURE_URL,
    channel: "chrome",
    launchOptions: { args: ["--enable-features=WebMCPTesting", "--enable-blink-features=WebMCP"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js build --config vite.e2e.config.ts && node node_modules/vite/bin/vite.js preview --config vite.e2e.config.ts",
    url: LAB_FIXTURE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
