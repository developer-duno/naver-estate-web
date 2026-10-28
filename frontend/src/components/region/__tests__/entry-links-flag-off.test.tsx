/**
 * 지역 장 입구(푸터·홈) — REGION_PAGES_ENABLED=false 로 배포하면 링크를 그리지 않는다(세션 484 PR 3c-1b 보완 F3).
 * 지역 장이 404 인데 모든 장의 푸터·홈에 /region 링크가 남으면 사이트 전체가 404 로 가는 링크를 갖게 된다.
 * 플래그 값만 false 로 바꾼 가짜 모듈을 쓴다(나머지 함수는 진짜).
 * 실행: npx vitest run src/components/region/__tests__/entry-links-flag-off.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

vi.mock("@/lib/seo/complex-page", async () => ({
  ...(await vi.importActual<typeof import("@/lib/seo/complex-page")>("@/lib/seo/complex-page")),
  REGION_PAGES_ENABLED: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("@/lib/api", () => ({
  getStats: vi.fn().mockResolvedValue({ complex_count: 100, article_count: 200 }),
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
}));

vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({ sessionToken: undefined, tokenReady: true, tokenError: false, dismissTokenError: vi.fn() }),
}));

import Footer from "@/components/Footer";
import HomePage from "@/app/page";

describe("플래그 false — 입구 링크 0", () => {
  it("푸터에 /region 링크 없음(다른 법적 고지 링크는 그대로)", () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('a[href^="/region"]')).toBeNull();
    expect(screen.getByRole("link", { name: "도움말" })).toHaveAttribute("href", "/help");
  });

  it("홈 소개 절에 '지역별 실거래가 보기 →' 없음(소개 절 링크는 그대로)", () => {
    const { container } = render(<HomePage />, { wrapper: TestQueryProvider });
    expect(container.querySelector('a[href^="/region"]')).toBeNull();
    expect(screen.getByRole("link", { name: "사용 가이드" })).toHaveAttribute("href", "/help");
  });
});
