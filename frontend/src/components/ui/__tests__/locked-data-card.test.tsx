/**
 * LockedDataCard + isAuthGateError 테스트 (B2 게이트 단계3, 세션 313)
 * 실행: npx vitest run src/components/ui/__tests__/locked-data-card.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LockedDataCard, { isAuthGateError, lockReasonOf } from "@/components/ui/locked-data-card";
import { ApiError } from "@/lib/api/core";

// 로그인 링크에 돌아올 주소를 붙인다(세션 481 보완 F9) — 지금 화면 주소를 고정
const nav = vi.hoisted(() => ({ pathname: "/complex/6139" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

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
    // 세션 481: 네이버 매물·호가는 승인이 아니라 로그인 뒤 — 인증은 행동 기능의 열쇠
    expect(screen.getByText("매물 목록은(는) 로그인하면 볼 수 있어요")).toBeInTheDocument();
    expect(screen.getByText(/공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀까지/)).toBeInTheDocument();
    expect(screen.queryByText(/승인된 공인중개사만/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?redirect=%2Fcomplex%2F6139");
    expect(screen.getByRole("link", { name: "공인중개사 인증" })).toHaveAttribute("href", "/verify");
  });

  it("label 기본값 = '이 정보'", () => {
    render(<LockedDataCard />);
    expect(screen.getByText("이 정보은(는) 로그인하면 볼 수 있어요")).toBeInTheDocument();
  });
});

describe("LockedDataCard — 사유·돌아올 주소 (세션 481 보완 F9·F10)", () => {
  it("로그인 링크 = /login?redirect=<지금 주소> · 주소를 모르면 /login", () => {
    nav.pathname = null;
    render(<LockedDataCard label="매물 목록" />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    nav.pathname = "/complex/6139";
  });

  it("reason=forbidden(403) — '이 계정으로는 볼 수 없어요' · 로그인 버튼 없음 · 인증 버튼만", () => {
    render(<LockedDataCard label="매물 목록" reason="forbidden" />);
    expect(screen.getByText("이 계정으로는 볼 수 없어요")).toBeInTheDocument();
    expect(screen.getByText("공인중개사 인증·승인 상태를 확인해 주세요")).toBeInTheDocument();
    expect(screen.queryByText(/로그인하면 볼 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공인중개사 인증" })).toHaveAttribute("href", "/verify");
  });

  it("lockReasonOf — 403 은 forbidden, 401·그 밖은 login", () => {
    expect(lockReasonOf(new ApiError("x", 403))).toBe("forbidden");
    expect(lockReasonOf(new ApiError("x", 401))).toBe("login");
    expect(lockReasonOf(new Error("x"))).toBe("login");
  });
});

describe("LockedDataCard — 문구 바꾸기 (세션 482 PR 1b 소비자 화면 맨 아래)", () => {
  it("title·description 을 주면 그 글자, 로그인·인증 버튼은 그대로", () => {
    render(<LockedDataCard title="지금 나온 매물과 호가, 가격 추이는 로그인하면 볼 수 있어요" description="공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀·인쇄까지" />);
    expect(screen.getByText("지금 나온 매물과 호가, 가격 추이는 로그인하면 볼 수 있어요")).toBeInTheDocument();
    expect(screen.getByText("공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀·인쇄까지")).toBeInTheDocument();
    expect(screen.queryByText(/은\(는\) 로그인하면/)).toBeNull();
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공인중개사 인증" })).toBeInTheDocument();
  });
});
