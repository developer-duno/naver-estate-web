/**
 * AdminLayout 회귀 가드 — 상단 가로탭 (세션 267, 세로 사이드바 → 가로탭 재설계)
 * 실행: npx vitest run src/components/admin/__tests__/AdminLayout.test.tsx
 *
 * AdminLeftNav.test 와 달리 이 컴포넌트는 usePathname 으로 active 를 판정하므로
 * next/navigation 을 직접 mock 한다 (AdminLeftNav 는 usePathname 미사용 = 템플릿 아님).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// usePathname mock — 테스트마다 반환 경로를 바꿔 active 판정 검증
const mockPathname = vi.fn<() => string>();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

import AdminLayout from "../AdminLayout";

function renderAt(path: string) {
  mockPathname.mockReturnValue(path);
  return render(
    <AdminLayout>
      <div>본문 콘텐츠</div>
    </AdminLayout>,
  );
}

describe("AdminLayout", () => {
  it("7개 네비 탭 + 메인으로 링크 + 본문이 렌더된다", () => {
    renderAt("/admin");
    for (const label of ["대시보드", "사용자", "크롤링", "캘린더", "데이터", "감사 로그", "설정"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "← 메인으로" })).toBeInTheDocument();
    expect(screen.getByText("본문 콘텐츠")).toBeInTheDocument();
  });

  it("현재 페이지 탭에 aria-current='page' 가 붙는다 (/admin/users)", () => {
    renderAt("/admin/users");
    const active = screen.getByRole("link", { name: "사용자" });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("비활성 탭에는 aria-current 가 없다", () => {
    renderAt("/admin/users");
    expect(screen.getByRole("link", { name: "크롤링" })).not.toHaveAttribute("aria-current");
    // 대시보드(/admin)는 정확매칭이라 /admin/users 에서 비활성
    expect(screen.getByRole("link", { name: "대시보드" })).not.toHaveAttribute("aria-current");
  });

  it("대시보드 탭은 /admin 정확매칭일 때 active", () => {
    renderAt("/admin");
    expect(screen.getByRole("link", { name: "대시보드" })).toHaveAttribute("aria-current", "page");
  });

  it("/admin/data 에서는 대시보드 비활성, 데이터만 active (startsWith 오작동 없음)", () => {
    renderAt("/admin/data");
    expect(screen.getByRole("link", { name: "대시보드" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "데이터" })).toHaveAttribute("aria-current", "page");
  });
});
