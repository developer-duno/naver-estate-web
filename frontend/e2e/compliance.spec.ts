import { test, expect } from "@playwright/test";
import { applyPublicMocks } from "./fixtures/public-mocks";

test.describe("광고법 컴플라이언스 회귀 가드", () => {
  test("Footer 면책 조항 — 홈 페이지", async ({ page }) => {
    await applyPublicMocks(page);
    await page.goto("/");

    await expect(
      page.getByText(/정확성·완전성·적시성을 보장하지 않습니다/),
    ).toBeVisible();
    await expect(
      page.getByText(/반드시 공인중개사를 통해 확인/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "이용약관" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "개인정보처리방침" }),
    ).toBeVisible();
  });

  test("Footer 면책 조항 — /blog 페이지", async ({ page }) => {
    await page.goto("/blog");
    await expect(
      page.getByText(/정확성·완전성·적시성을 보장하지 않습니다/),
    ).toBeVisible();
  });

  test("메인 H1 — '공인중개사를 위한 매물·시세 분석 도구' 정합", async ({
    page,
  }) => {
    await applyPublicMocks(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toContainText("공인중개사를 위한 매물·시세 분석 도구");
  });

  test("signup 마케팅 수신 동의 체크박스 — 개인정보보호법 정합", async ({
    page,
  }) => {
    await page.goto("/signup");

    // 마케팅 수신 동의는 (선택) 이어야 함 (정보통신망법: 광고 전송은 선택 동의 원칙)
    await expect(
      page.getByText(/이메일 및 카카오톡 등으로 받고/),
    ).toBeVisible();
    await expect(page.getByText(/미동의해도 가입할 수 있어요/)).toBeVisible();
    await expect(page.getByText(/\(선택\)/)).toBeVisible();
  });
});
