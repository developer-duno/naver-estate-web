/**
 * 단지 장 남색 띠 재료(세션 524 B40 PR 1) — 빵부스러기 글자 색 두 벌 · 띠 사실 줄.
 * 빵부스러기는 지역 3장이 tone 없이 같이 쓴다 → 기본값은 지금 색 그대로여야 한다(설계 D4 · 지역 장 픽셀 변화 0).
 * 실행: npx vitest run src/components/complex/public/__tests__/band-parts.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ComplexBreadcrumb from "../ComplexBreadcrumb";
import { bandFactLine } from "../ComplexGlance";

const crumbs = [
  { name: "홈", href: "/" },
  { name: "대전", href: null },
  { name: "햇살마을", href: null },
];

describe("ComplexBreadcrumb tone", () => {
  it("tone 없이 = 지금 색(회색 작은 글자) — 지역 3장이 이 모양", () => {
    render(<ComplexBreadcrumb crumbs={crumbs} />);
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav.className).toBe("text-xs text-gray-500");
    expect(nav.querySelector('[aria-current="page"]')!.className).toBe("text-gray-700");
  });

  it("navy = 띠 안 주황 글자 · 링크·글자·JSON-LD 는 같다", () => {
    const { container } = render(<ComplexBreadcrumb crumbs={crumbs} tone="navy" />);
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav.className).toContain("text-brand-orange");
    expect(nav.querySelector('[aria-current="page"]')!.className).toBe("text-brand-on-navy-muted");
    expect(nav.textContent).toBe("홈›대전›햇살마을");
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/"]);
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });
});

describe("bandFactLine", () => {
  it("세 값 다 있으면 「1998년 사용승인 · 4,168세대 · 16개동」", () => {
    expect(bandFactLine({ use_approve_year: 1998, household_count: 4168, building_count: 16 })).toBe("1998년 사용승인 · 4,168세대 · 16개동");
  });

  it("없는 값은 빠진다 · 셋 다 없으면 null(줄 없음)", () => {
    expect(bandFactLine({ use_approve_year: null, household_count: 4168, building_count: null })).toBe("4,168세대");
    expect(bandFactLine({ use_approve_year: 2010, household_count: null, building_count: 6 })).toBe("2010년 사용승인 · 6개동");
    expect(bandFactLine({ use_approve_year: null, household_count: null, building_count: null })).toBeNull();
  });
});
