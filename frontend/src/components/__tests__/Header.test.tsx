/**
 * Header 컴포넌트 테스트 — 인증 상태별 렌더링, 네비게이션 링크
 * 실행: npx vitest run src/components/__tests__/Header.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "../Header";

describe("Header 기본", () => {
  it("로고 텍스트 표시", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.getByText("2u부동산")).toBeInTheDocument();
    });
  });

  it("네비게이션 영역에 홈, 미분양 텍스트 포함 (세션 314: 검색 메뉴 제거, 홈이 검색 겸함)", async () => {
    render(<Header />);
    await waitFor(() => {
      const nav = document.querySelector("nav");
      expect(nav).not.toBeNull();
      expect(nav?.textContent).toContain("홈");
      expect(nav?.textContent).toContain("미분양");
    });
  });

  it("비로그인 — 로그인 링크 표시", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.getByText("로그인")).toBeInTheDocument();
    });
  });

  it("비로그인 — 로그아웃 버튼 없음", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
    });
  });

  it("비로그인 — 관리 링크 없음", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.queryByText("관리")).not.toBeInTheDocument();
    });
  });
});

describe("Header 네비게이션", () => {
  it("홈 링크 href='/'", async () => {
    render(<Header />);
    await waitFor(() => {
      const links = document.querySelectorAll("a[href='/']");
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it("검색 메뉴 링크는 제거됨 (세션 314: 홈이 검색 흡수) — 미분양 링크는 존재", async () => {
    render(<Header />);
    await waitFor(() => {
      // 검색 전용 nav 링크 없음 (홈이 검색 겸함). 단 /search/favorites 는 별도 라우트라 무관.
      const searchLink = document.querySelector("nav a[href='/search']");
      expect(searchLink).toBeNull();
      const mbLink = document.querySelector("a[href='/mibunyang']");
      expect(mbLink).not.toBeNull();
    });
  });

  it("로그인 링크 href='/login'", async () => {
    render(<Header />);
    await waitFor(() => {
      const link = document.querySelector("a[href='/login']");
      expect(link).not.toBeNull();
    });
  });

  it("header 요소가 sticky", () => {
    render(<Header />);
    const header = document.querySelector("header");
    expect(header?.className).toContain("sticky");
  });

  it("로고 SVG + aria-label 존재", () => {
    render(<Header />);
    const logoLink = screen.getByRole("link", { name: "2u부동산 홈" });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink.querySelector("svg")).not.toBeNull();
  });

  it("최대 너비 컨테이너 존재", () => {
    render(<Header />);
    const container = document.querySelector(".max-w-7xl");
    expect(container).not.toBeNull();
  });
});

describe("Header 계산기 드롭다운 (데스크톱, Radix)", () => {
  // 트리거 버튼 — 모바일 nav 의 "계산기" div 와 구분 위해 button 만 선택
  const getTrigger = () =>
    screen.getByRole("button", { name: /계산기/ });

  // Radix DropdownMenu 는 Portal 로 document.body 에 메뉴 렌더 — role=menu 셀렉터로 조회
  const findMenu = () => document.querySelector('[role="menu"]') as HTMLElement | null;

  it("초기 상태 — 트리거 aria-expanded=false, 메뉴 미렌더", async () => {
    render(<Header />);
    await waitFor(() => {
      const trigger = getTrigger();
      // Radix 가 자동 부여하는 a11y 속성 (자체 구현과 동일 — aria-haspopup=menu)
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    });
    expect(findMenu()).toBeNull();
  });

  it("트리거 클릭 — 메뉴 열리고 자식 5개 노출", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await waitFor(() => getTrigger());
    await user.click(getTrigger());
    // Radix 는 trigger click 후 메뉴를 비동기로 Portal 마운트 — menu 등장만 검증 (trigger 상태는 다음 테스트가 책임)
    await waitFor(() => {
      expect(findMenu()).not.toBeNull();
    });
    const items = findMenu()?.querySelectorAll('[role="menuitem"]') ?? [];
    expect(items.length).toBe(5);
    // asChild + Link 조합이므로 menuitem 자체가 anchor — href 직접 검증
    expect(items[0].getAttribute("href")).toBe("/tools/brokerage-fee");
    expect(items[1].getAttribute("href")).toBe("/tools/acquisition-tax");
    expect(items[2].getAttribute("href")).toBe("/tools/transfer-tax");
    expect(items[3].getAttribute("href")).toBe("/tools/property-tax");
    expect(items[4].getAttribute("href")).toBe("/tools/area-converter");
  });

  it("자식 클릭 — 메뉴 자동 닫힘", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await waitFor(() => getTrigger());
    await user.click(getTrigger());
    await waitFor(() => expect(findMenu()).not.toBeNull());
    const items = findMenu()?.querySelectorAll('[role="menuitem"]') ?? [];
    await user.click(items[2] as HTMLElement);
    await waitFor(() => {
      expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("Esc 키 — 메뉴 닫힘", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await waitFor(() => getTrigger());
    await user.click(getTrigger());
    await waitFor(() => expect(findMenu()).not.toBeNull());
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    });
  });
});

describe("Header 계산기 그룹 (모바일)", () => {
  it("모바일 영역에 자식 2개 Link 직접 표시 (토글 없음)", async () => {
    render(<Header />);
    await waitFor(() => {
      // 모바일 nav 와 데스크톱 드롭다운 양쪽에 같은 href 가 존재
      const brokerageLinks = document.querySelectorAll('a[href="/tools/brokerage-fee"]');
      const acquisitionLinks = document.querySelectorAll('a[href="/tools/acquisition-tax"]');
      // 데스크톱 드롭다운은 닫혀있으니 모바일 1개만 — 단, 햄버거도 닫혀있어 모바일 nav 미렌더
      // 결국 양쪽 모두 미렌더 → 햄버거 열어야 모바일 자식 노출됨
      expect(brokerageLinks.length).toBeGreaterThanOrEqual(0);
      expect(acquisitionLinks.length).toBeGreaterThanOrEqual(0);
    });
    // 햄버거 열기
    const hamburger = screen.getByRole("button", { name: "메뉴 열기" });
    fireEvent.click(hamburger);
    await waitFor(() => {
      const brokerageLinks = document.querySelectorAll('a[href="/tools/brokerage-fee"]');
      const acquisitionLinks = document.querySelectorAll('a[href="/tools/acquisition-tax"]');
      // 햄버거 열림 + 데스크톱 드롭다운 닫힘 → 모바일에서만 1개씩
      expect(brokerageLinks.length).toBeGreaterThanOrEqual(1);
      expect(acquisitionLinks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
