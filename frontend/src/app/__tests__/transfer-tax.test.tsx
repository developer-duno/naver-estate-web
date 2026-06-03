/**
 * /tools/transfer-tax 페이지 통합 테스트 — 초기화 버튼 회귀 가드 (세션 268)
 * 실행: npx vitest run src/app/__tests__/transfer-tax.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TransferTaxToolPage from "../tools/transfer-tax/page";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// 양도일 초기값(todayISO)이 reset 재호출에서도 같은 날짜로 복원되는지 검증하려면 날짜 고정 필요
const todayISO = () => new Date().toISOString().slice(0, 10);

describe("/tools/transfer-tax 페이지", () => {
  it("Hero 제목과 양도가액 입력이 렌더된다", () => {
    render(<TransferTaxToolPage />);
    expect(screen.getByRole("heading", { name: "양도소득세 계산기", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("양도가액 (만원)")).toBeInTheDocument();
  });

  /** 초기화 버튼 — 입력값을 마운트 초기값으로 복원 (양도일=todayISO() 재호출, 빈값/고정날짜 금지) */
  it("초기화 버튼 — 양도가액 빈값 복귀 + 양도일은 오늘로 재설정", () => {
    render(<TransferTaxToolPage />);
    const transferAmount = screen.getByLabelText("양도가액 (만원)") as HTMLInputElement;
    const transferDate = screen.getByLabelText("양도일") as HTMLInputElement;
    // 양도일 초기값 = 오늘
    expect(transferDate.value).toBe(todayISO());
    // 값 변경
    fireEvent.change(transferAmount, { target: { value: "150000" } });
    fireEvent.change(transferDate, { target: { value: "2020-01-01" } });
    expect(transferAmount.value).toBe("150000");
    expect(transferDate.value).toBe("2020-01-01");
    // 초기화
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    // 마운트 초기값 복귀: 양도가액 빈값(0) + 양도일은 빈값/고정이 아니라 오늘로 재설정
    expect((screen.getByLabelText("양도가액 (만원)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("양도일") as HTMLInputElement).value).toBe(todayISO());
    // 입력값 부족 → empty 분기 라벨 재노출
    expect(screen.getByText(/입력값이 부족합니다/)).toBeInTheDocument();
  });
});
