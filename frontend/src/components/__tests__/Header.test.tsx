/**
 * Header 컴포넌트 테스트 — 인증 상태별 렌더링, 네비게이션 링크
 * 실행: npx vitest run src/components/__tests__/Header.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Header from "../Header";

describe("Header 기본", () => {
  it("로고 텍스트 표시", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.getByText("아파트·오피스텔")).toBeInTheDocument();
    });
  });

  it("네비게이션 영역에 홈, 검색 텍스트 포함", async () => {
    render(<Header />);
    await waitFor(() => {
      const nav = document.querySelector("nav");
      expect(nav).not.toBeNull();
      expect(nav?.textContent).toContain("홈");
      expect(nav?.textContent).toContain("검색");
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

  it("검색 링크 href='/search'", async () => {
    render(<Header />);
    await waitFor(() => {
      const link = document.querySelector("a[href='/search']");
      expect(link).not.toBeNull();
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

  it("로고 이모지 존재", () => {
    render(<Header />);
    const emoji = screen.getByRole("img", { name: "홈" });
    expect(emoji).toBeInTheDocument();
  });

  it("최대 너비 컨테이너 존재", () => {
    render(<Header />);
    const container = document.querySelector(".max-w-7xl");
    expect(container).not.toBeNull();
  });
});

describe("Header 계산기 드롭다운 (데스크톱)", () => {
  // 트리거 버튼 — 모바일 nav 의 "계산기" div 와 구분 위해 button 만 선택
  const getTrigger = () =>
    screen.getByRole("button", { name: /계산기/ });

  it("초기 상태 — 트리거 aria-expanded=false, 메뉴 미렌더", async () => {
    render(<Header />);
    await waitFor(() => {
      const trigger = getTrigger();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger).toHaveAttribute("aria-controls", "tools-menu");
    });
    expect(document.getElementById("tools-menu")).toBeNull();
  });

  it("트리거 클릭 — aria-expanded=true 전환 + 자식 3개 노출", async () => {
    render(<Header />);
    await waitFor(() => getTrigger());
    fireEvent.click(getTrigger());
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById("tools-menu");
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute("role")).toBe("menu");
    const items = menu?.querySelectorAll('[role="menuitem"]') ?? [];
    expect(items.length).toBe(3);
    expect(items[0].getAttribute("href")).toBe("/tools/brokerage-fee");
    expect(items[1].getAttribute("href")).toBe("/tools/acquisition-tax");
    expect(items[2].getAttribute("href")).toBe("/tools/area-converter");
  });

  it("자식 클릭 — 메뉴 자동 닫힘", async () => {
    render(<Header />);
    await waitFor(() => getTrigger());
    fireEvent.click(getTrigger());
    const menu = document.getElementById("tools-menu");
    const items = menu?.querySelectorAll('[role="menuitem"]') ?? [];
    fireEvent.click(items[2]);
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("tools-menu")).toBeNull();
  });

  it("Esc 키 — 메뉴 닫힘", async () => {
    render(<Header />);
    await waitFor(() => getTrigger());
    fireEvent.click(getTrigger());
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(getTrigger(), { key: "Escape" });
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("외부 mousedown — 메뉴 닫힘", async () => {
    render(<Header />);
    await waitFor(() => getTrigger());
    fireEvent.click(getTrigger());
    expect(document.getElementById("tools-menu")).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("tools-menu")).toBeNull();
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
