/**
 * E2E 테스트 공통 유틸
 */
import { type Page, expect } from "@playwright/test";

/** localStorage에 값 시드 (페이지 로드 전 호출) */
export async function seedLocalStorage(
  page: Page,
  key: string,
  value: unknown,
) {
  await page.addInitScript(
    ({ k, v }) => {
      localStorage.setItem(k, JSON.stringify(v));
    },
    { k: key, v: value },
  );
}

/** 테이블/빈 결과/로딩 중 하나가 보일 때까지 대기 */
export async function waitForContentOrEmpty(page: Page, timeout = 30_000) {
  const table = page.locator("table, [role='table']");
  const noResults = page.locator("text=검색 결과가 없습니다");
  const loading = page.locator("text=불러오는 중");
  const noData = page.locator("text=데이터가 없습니다");
  await expect(
    table.or(noResults).or(loading).or(noData),
  ).toBeVisible({ timeout });
}

/** 헤더가 보이는지 확인 */
export async function expectHeader(page: Page) {
  await expect(page.locator("header")).toBeVisible();
}
