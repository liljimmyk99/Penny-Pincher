import { defineConfig } from "@playwright/test";

/**
 * `npm run seed` only: fills a demo account on the e2e stack (seed/seed.spec.ts).
 * Starts the stack if it isn't running and never removes it, so you can sign in
 * afterwards. Kept apart from playwright.config.ts so `npm test` never runs it.
 */
export default defineConfig({
  testDir: "./seed",
  globalSetup: "./support/global-setup.ts",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
});
