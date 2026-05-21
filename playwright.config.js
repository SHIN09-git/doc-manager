import { defineConfig } from "@playwright/test";

const config = {
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 900 },
  },
};

if (!process.env.PLAYWRIGHT_NO_WEBSERVER) {
  config.webServer = {
    command: "node e2e/serve-static.mjs",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
  };
}

export default defineConfig(config);
