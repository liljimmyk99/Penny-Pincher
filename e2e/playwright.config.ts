import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./support/stack";

/**
 * The M1 testing gate, automated (see AGENTS.md in this folder).
 * global-setup builds and starts compose.yml; global-teardown removes it
 * unless E2E_KEEP_STACK=1.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/global-setup.ts",
  globalTeardown: "./support/global-teardown.ts",
  // One shared stack, and the resilience test stops the API: run one test at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "on-failure" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    // Caddy's internal CA signs localhost.
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "smoke", testIgnore: /resilience\.spec\.ts/ },
    // Stops and restarts the API container, so it runs after everything else.
    { name: "resilience", testMatch: /resilience\.spec\.ts/, dependencies: ["smoke"] },
  ],
});
