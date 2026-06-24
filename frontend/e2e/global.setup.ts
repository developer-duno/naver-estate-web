import { test as setup, expect } from "@playwright/test";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const AUTH_FILE = path.join("e2e", ".auth", "admin.json");

function loadDotEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadDotEnv(".env.test");
const email = process.env.TEST_ADMIN_EMAIL ?? fileEnv.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD ?? fileEnv.TEST_ADMIN_PASSWORD;

setup("authenticate as admin", async ({ page }) => {
  setup.skip(
    !email || !password,
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD missing — admin e2e will be skipped"
  );

  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const attemptLogin = async () => {
    await page.goto("/login");
    // middleware가 이미 로그인된 세션을 홈으로 리다이렉트한 경우 즉시 완료
    if (!page.url().includes("/login")) {
      return;
    }
    await page.locator("#login-email").fill(email!);
    await page.locator("#login-password").fill(password!);
    await page.locator('button[type="submit"]').click();

    // 로그인 폼 에러 alert 만 매칭 — `#main-content` 로 스코프해 sonner Toaster 의
    // 상시 빈 live-region([role=alert], <main> 밖)을 제외한다. 스코프 안 하면 Supabase
    // 로그인이 CI 에서 느릴 때 빈 sonner alert 가 visible 로 먼저 잡혀 가짜 "fail"(빈 메시지)
    // 판정 → flaky. 폼 에러는 error state 있을 때만 텍스트와 함께 렌더된다.
    const errAlert = page.locator('#main-content [role="alert"]');
    const navigated = page
      .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 })
      .then(() => "ok" as const)
      .catch(() => "timeout" as const);
    const failed = errAlert
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "fail" as const)
      .catch(() => "no-error" as const);

    const outcome = await Promise.race([navigated, failed]);
    if (outcome === "fail") {
      const msg = (await errAlert.textContent())?.trim() ?? "unknown error";
      throw new Error(`Login failed: ${msg}`);
    }
    if (outcome === "timeout") {
      throw new Error("Login timed out — still on /login after 15s");
    }
  };

  try {
    await attemptLogin();
  } catch (err) {
    console.warn(`[setup] first login attempt failed: ${(err as Error).message}. retrying in 5s...`);
    await page.waitForTimeout(5_000);
    await attemptLogin();
  }

  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`[setup] storageState saved → ${AUTH_FILE}`);
});
