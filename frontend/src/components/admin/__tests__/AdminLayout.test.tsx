/**
 * AdminLayout 회귀 가드 — 상단 가로탭 (세션 267, 세로 사이드바 → 가로탭 재설계)
 * 실행: npx vitest run src/components/admin/__tests__/AdminLayout.test.tsx
 *
 * AdminLeftNav.test 와 달리 이 컴포넌트는 usePathname 으로 active 를 판정하므로
 * next/navigation 을 직접 mock 한다 (AdminLeftNav 는 usePathname 미사용 = 템플릿 아님).
 */
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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

/**
 * 가로스크롤 페이드 힌트 — 탭이 화면 밖으로 잘렸을 때만 "옆에 더 있다"는 신호를 띄운다.
 * 힌트는 aria-hidden 오버레이라 role 로 못 잡으므로 클래스(from-gray-50)로 조회한다.
 */
function queryFadeHint(container: HTMLElement) {
  return container.querySelector(".from-gray-50");
}

/** nav 의 스크롤 치수를 강제 지정 — jsdom 은 레이아웃이 없어 전부 0 이라 직접 심어야 한다. */
function setNavMetrics(
  nav: HTMLElement,
  metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  Object.defineProperty(nav, "scrollWidth", { value: metrics.scrollWidth, configurable: true });
  Object.defineProperty(nav, "clientWidth", { value: metrics.clientWidth, configurable: true });
  Object.defineProperty(nav, "scrollLeft", { value: metrics.scrollLeft, configurable: true });
}

describe("AdminLayout 가로스크롤 페이드 힌트", () => {
  it("스크롤 여지가 없으면(데스크톱·jsdom 기본 0) 힌트를 안 띄운다", () => {
    // jsdom 은 scrollWidth·clientWidth 가 둘 다 0 → noScroll=true → 힌트 숨김이 기본 상태
    const { container } = renderAt("/admin");
    expect(queryFadeHint(container)).toBeNull();
  });

  it("오른쪽에 잘린 탭이 남아 있으면 힌트를 띄운다", () => {
    const { container } = renderAt("/admin");
    const nav = container.querySelector("nav")!;
    // 내용 800px > 보이는 폭 400px, 아직 왼쪽 끝(scrollLeft=0) → 오른쪽에 볼 게 남음
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(queryFadeHint(container)).not.toBeNull();
  });

  it("끝까지 스크롤하면 힌트가 사라진다", () => {
    const { container } = renderAt("/admin");
    const nav = container.querySelector("nav")!;
    // 먼저 힌트가 뜬 상태를 만든다
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(queryFadeHint(container)).not.toBeNull();

    // 오른쪽 끝까지 밀면(400 + 400 = 800) 더 볼 게 없으므로 힌트 숨김
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 400, scrollLeft: 400 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(queryFadeHint(container)).toBeNull();
  });

  it("창 크기가 바뀌어 스크롤이 필요 없어지면 힌트가 사라진다 (resize 대응)", () => {
    const { container } = renderAt("/admin");
    const nav = container.querySelector("nav")!;
    // 좁은 창: 내용 800px > 보이는 폭 400px → 힌트 표시
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(nav);
    });
    expect(queryFadeHint(container)).not.toBeNull();

    // 창을 넓혀 탭이 전부 들어오는 상태로 전환 — scroll 이벤트는 안 나므로 resize 로만 갱신돼야 한다
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 800, scrollLeft: 0 });
    act(() => {
      fireEvent(window, new Event("resize"));
    });
    expect(queryFadeHint(container)).toBeNull();
  });

  it("힌트는 aria-hidden + 클릭 통과라 메인으로 링크를 가리지 않는다", () => {
    const { container } = renderAt("/admin");
    const nav = container.querySelector("nav")!;
    setNavMetrics(nav, { scrollWidth: 800, clientWidth: 400, scrollLeft: 0 });
    act(() => {
      fireEvent.scroll(nav);
    });
    const hint = queryFadeHint(container)!;
    expect(hint).toHaveAttribute("aria-hidden", "true");
    expect(hint.className).toContain("pointer-events-none");
    // 기존 링크 접근성 보존 확인
    expect(screen.getByRole("link", { name: "← 메인으로" })).toBeInTheDocument();
  });
});
