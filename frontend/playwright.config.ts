import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts$/,
    },
    {
      name: "public",
      testIgnore: [
        /global\.setup\.ts$/,
        /admin-dashboard\.spec\.ts$/,
        /admin-pages\.spec\.ts$/,
        /public-flow\.spec\.ts$/,
        /compare-visual\.spec\.ts$/,
        /complex-visual\.spec\.ts$/,
      ],
    },
    {
      name: "public-visual",
      testMatch: /(public-flow|compare-visual)\.spec\.ts$/,
    },
    {
      name: "admin",
      testMatch: /(admin-(dashboard|pages)|complex-visual)\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        storageState: "e2e/.auth/admin.json",
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --webpack --port ${port}`,
    port,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      // CSP connect-src 가 http://localhost:* 만 허용하므로 API URL 을 localhost 로 고정
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002",
    },
  },
});
