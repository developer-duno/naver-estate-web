/**
 * Header 컴포넌트 테스트 — 인증 상태별 렌더링, 네비게이션 링크
 * 실행: npx vitest run src/components/__tests__/Header.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Header from "../Header";

describe("Header 기본", () => {
  it("로고 텍스트 표시", async () => {
    render(<Header />);
    await waitFor(() => {
      expect(screen.getByText("아파트 매물")).toBeInTheDocument();
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
