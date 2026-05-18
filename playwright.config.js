import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "node e2e/serve-static.mjs",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
