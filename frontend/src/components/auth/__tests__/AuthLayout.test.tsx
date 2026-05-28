/**
 * AuthLayout 단일컬럼 wrapper 회귀 가드
 * - title·description (CardTitle·CardDescription sub-component 정확 호출 답습)
 * - children 렌더링
 * - DataSourceBadges compact 노출/숨김 (hideBadges prop)
 * - 외곽 max-w-md + min-h-[calc] 보존
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthLayout } from "../AuthLayout";

describe("AuthLayout", () => {
  it("title 을 CardTitle 로 렌더", () => {
    render(
      <AuthLayout title="로그인">
        <div>폼</div>
      </AuthLayout>,
    );
    expect(screen.getByText("로그인")).toBeInTheDocument();
  });

  it("description 있으면 CardDescription 표시", () => {
    render(
      <AuthLayout title="가입 신청" description="공인중개사 등록 후 7일 무료 체험">
        <div />
      </AuthLayout>,
    );
    expect(
      screen.getByText("공인중개사 등록 후 7일 무료 체험"),
    ).toBeInTheDocument();
  });

  it("description 없으면 CardDescription 미렌더", () => {
    const { container } = render(
      <AuthLayout title="로그인">
        <div />
      </AuthLayout>,
    );
    expect(
      container.querySelector("[data-slot='card-description']"),
    ).toBeNull();
  });

  it("children 렌더", () => {
    render(
      <AuthLayout title="로그인">
        <form data-testid="auth-form">로그인 폼</form>
      </AuthLayout>,
    );
    expect(screen.getByTestId("auth-form")).toBeInTheDocument();
  });

  it("hideBadges 미명시 시 DataSourceBadges compact 노출", () => {
    render(
      <AuthLayout title="로그인">
        <div />
      </AuthLayout>,
    );
    expect(screen.getByText("공식 데이터 출처")).toBeInTheDocument();
    expect(screen.getByText("네이버 부동산")).toBeInTheDocument();
  });

  it("hideBadges=true 시 DataSourceBadges 미노출", () => {
    render(
      <AuthLayout title="로그인" hideBadges>
        <div />
      </AuthLayout>,
    );
    expect(screen.queryByText("공식 데이터 출처")).toBeNull();
    expect(screen.queryByText("네이버 부동산")).toBeNull();
  });

  it("Card 가 max-w-md 폭 유지", () => {
    const { container } = render(
      <AuthLayout title="로그인">
        <div />
      </AuthLayout>,
    );
    const card = container.querySelector("[data-slot='card']");
    expect(card?.className).toContain("max-w-md");
  });

  it("외곽 wrapper 가 min-h-[calc] 적용 (Header·Footer 제외 viewport 중앙)", () => {
    const { container } = render(
      <AuthLayout title="로그인">
        <div />
      </AuthLayout>,
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain("min-h-[calc(100vh-200px)]");
    expect(outer.className).toContain("flex");
    expect(outer.className).toContain("items-center");
  });
});
