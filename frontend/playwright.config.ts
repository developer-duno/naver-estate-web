import { defineConfig, devices } from "@playwright/test";

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
        /admin-dashboard-sections\.spec\.ts$/,
        /admin-pages\.spec\.ts$/,
        /public-flow\.spec\.ts$/,
        /compare-visual\.spec\.ts$/,
        /complex-visual\.spec\.ts$/,
        /mibunyang-visual\.spec\.ts$/,
        /search-visual\.spec\.ts$/,
      ],
    },
    {
      name: "public-visual",
      testMatch: /(public-flow|compare-visual|mibunyang-visual|search-visual)\.spec\.ts$/,
    },
    {
      // 휴대폰 화면 시각 회귀(세션 417) — 미분양 상세의 분양가 표가 390px 에서 눌려 머리글이
      // 세로로 꺾이던 결함을 데스크톱 전용 장이 못 잡았다. 범위는 mibunyang-visual 하나로 좁힌다
      // (다른 시각 spec 은 데스크톱 기준 대기 조건이라 모바일에서 검증되지 않았다).
      // - browserName: iPhone 13 기술자는 기본 엔진이 webkit 인데 CI 는 chromium 만 설치한다.
      //   뷰포트·isMobile·터치·UA 만 빌려 쓰고 엔진은 chromium 으로 고정한다.
      // - deviceScaleFactor 1: 기본 3배면 fullPage PNG 가 가로·세로 3배(면적 9배)로 커진다.
      //   레이아웃 회귀 감지는 CSS 픽셀 1배로 충분하다(blog iphone 장과 같은 배율).
      // baseline = mibunyang-public-visual-mobile-linux.png
      name: "public-visual-mobile",
      testMatch: /mibunyang-visual\.spec\.ts$/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        deviceScaleFactor: 1,
      },
    },
    {
      name: "admin",
      testMatch: /(admin-(dashboard|dashboard-sections|pages)|complex-visual)\.spec\.ts$/,
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
