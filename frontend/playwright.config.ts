import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts$/,
    },
    {
      name: "public",
      testIgnore: [/global\.setup\.ts$/, /admin-dashboard\.spec\.ts$/],
    },
    {
      name: "admin",
      testMatch: /admin-dashboard\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        storageState: "e2e/.auth/admin.json",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --webpack",
    port: 3000,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
