/**
 * LockedDataCard + isAuthGateError 테스트 (B2 게이트 단계3, 세션 313)
 * 실행: npx vitest run src/components/ui/__tests__/locked-data-card.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LockedDataCard, { isAuthGateError } from "@/components/ui/locked-data-card";
import { ApiError } from "@/lib/api/core";

describe("isAuthGateError", () => {
  it("ApiError 403 → true", () => {
    expect(isAuthGateError(new ApiError("forbidden", 403))).toBe(true);
  });
  it("ApiError 401 → true", () => {
    expect(isAuthGateError(new ApiError("unauthorized", 401))).toBe(true);
  });
  it("ApiError 500 → false (5xx 는 잠금 아님)", () => {
    expect(isAuthGateError(new ApiError("server", 500))).toBe(false);
  });
  it("ApiError 404 → false", () => {
    expect(isAuthGateError(new ApiError("notfound", 404))).toBe(false);
  });
  it("일반 Error → false", () => {
    expect(isAuthGateError(new Error("network"))).toBe(false);
  });
  it("null/undefined → false", () => {
    expect(isAuthGateError(null)).toBe(false);
    expect(isAuthGateError(undefined)).toBe(false);
  });
});

describe("LockedDataCard", () => {
  it("라벨 + 로그인·인증 링크 렌더", () => {
    render(<LockedDataCard label="매물 목록" />);
    expect(screen.getByText(/매물 목록.*승인된 공인중개사만/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "공인중개사 인증" })).toHaveAttribute("href", "/verify");
  });

  it("label 기본값 = '이 정보'", () => {
    render(<LockedDataCard />);
    expect(screen.getByText(/이 정보.*승인된 공인중개사만/)).toBeInTheDocument();
  });
});
