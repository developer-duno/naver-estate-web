/**
 * ErrorActions 공통 컴포넌트 테스트
 * 실행: npx vitest run src/components/__tests__/ErrorActions.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorActions from "../ErrorActions";

// useSmartBack 은 useRouter 를 사용 — next/navigation 모킹
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

describe("ErrorActions 공통 컴포넌트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notfound variant", () => {
    it("홈/검색/이전 페이지 3버튼을 렌더한다 (다시 시도 없음)", () => {
      render(<ErrorActions type="notfound" />);
      expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
      expect(screen.getByRole("button", { name: "이전 페이지" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    });
  });

  describe("error variant", () => {
    it("onRetry 가 주입되면 '다시 시도' 버튼이 렌더되고 클릭 시 콜백 실행", () => {
      const retry = vi.fn();
      render(<ErrorActions type="error" onRetry={retry} />);
      const btn = screen.getByRole("button", { name: "다시 시도" });
      fireEvent.click(btn);
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it("onRetry 가 없으면 '다시 시도' 버튼이 렌더되지 않는다", () => {
      render(<ErrorActions type="error" />);
      expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    });
  });

  describe("useSmartBack 통합", () => {
    it("이전 페이지 버튼 클릭 시 에러 없이 동작 (referrer 가 없으면 router.push('/'))", () => {
      render(<ErrorActions type="notfound" />);
      const backBtn = screen.getByRole("button", { name: "이전 페이지" });
      // referrer 없는 jsdom 기본 환경 → router.push('/') 폴백
      fireEvent.click(backBtn);
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
