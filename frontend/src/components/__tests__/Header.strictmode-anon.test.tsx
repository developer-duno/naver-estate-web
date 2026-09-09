/**
 * Header StrictMode 비로그인 회귀 테스트 (세션 395 검증 2차 — 맹점 보강)
 *
 * Header.strictmode.test.tsx 는 "세션 있음 → StrictMode 이중 실행에서도 로그인 상태를 그린다"만 본다.
 * 반대 방향(세션 없음 → 이중 실행에서도 비로그인 상태가 정확히 유지된다)은 E2E 에도 단위 테스트에도 없었다.
 * 이 파일은 test-setup.ts 의 전역 supabase mock(getSession → session null)을 그대로 써서 그 반대 케이스를 고정한다.
 *
 * 실행: npx vitest run src/components/__tests__/Header.strictmode-anon.test.tsx
 */
import { describe, it, expect } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Header from "../Header";

describe("Header — StrictMode 이중 실행 + 세션 없음 (세션 395 검증 2차)", () => {
  it("StrictMode 렌더 — 로그인 링크가 보이고 로그아웃 버튼·이메일은 없다", async () => {
    render(
      <StrictMode>
        <Header />
      </StrictMode>
    );
    await waitFor(() => {
      expect(screen.getByText("로그인")).toBeInTheDocument();
    });
    expect(screen.queryByText("로그아웃")).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
