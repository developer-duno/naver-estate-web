/**
 * /search → 홈 리다이렉트 테스트 (세션 314 F1) — 홈이 검색을 흡수해 /search 는 홈으로 보냄.
 * URL 파라미터 보존 확인 (북마크·SEO·외부링크 동작 유지).
 * 실행: npx vitest run src/app/__tests__/search-redirect.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockReplace, mockSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParams: { value: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams.value,
}));

import SearchPage from "../search/page";

function renderSearch() {
  return render(<SearchPage />, { wrapper: TestQueryProvider });
}

describe("/search → 홈 리다이렉트 (F1)", () => {
  beforeEach(() => { mockReplace.mockClear(); });

  it("파라미터 없으면 홈(/)으로 replace", () => {
    mockSearchParams.value = new URLSearchParams();
    renderSearch();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("검색 파라미터는 보존하며 홈으로 (q=래미안)", () => {
    mockSearchParams.value = new URLSearchParams("q=래미안&types=APT");
    renderSearch();
    const target = mockReplace.mock.calls[0][0] as string;
    expect(target.startsWith("/?")).toBe(true);
    expect(target).toContain("q=");
    expect(target).toContain("types=APT");
  });

  it("지역 파라미터도 보존 (sido/sigungu)", () => {
    mockSearchParams.value = new URLSearchParams("sido=서울&sigungu=강남구");
    renderSearch();
    const target = mockReplace.mock.calls[0][0] as string;
    expect(target.startsWith("/?")).toBe(true);
    expect(target).toContain("sido=");
    expect(target).toContain("sigungu=");
  });
});
