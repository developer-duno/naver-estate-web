/**
 * ErrorBoundary 컴포넌트 테스트 — 에러 캐치, 폴백 UI
 * 실행: npx vitest run src/components/__tests__/ErrorBoundary.test.tsx
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";

function GoodChild() {
  return <div>정상 컨텐츠</div>;
}

function BadChild(): React.ReactElement {
  throw new Error("테스트 에러");
}

describe("ErrorBoundary", () => {
  it("정상 자식 컴포넌트 렌더링", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("정상 컨텐츠")).toBeInTheDocument();
  });

  it("에러 발생 시 폴백 UI 표시", () => {
    // React 에러 바운더리 에러 로그 억제
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("오류가 발생했습니다")).toBeInTheDocument();
    expect(screen.getByText("새로고침")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("에러 메시지 표시", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );
    expect(screen.getByText(/테스트 에러/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
