/**
 * /tools/brokerage-fee 페이지 통합 테스트
 * 실행: npx vitest run src/app/__tests__/brokerage-fee.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import BrokerageFeeToolPage from "../tools/brokerage-fee/page";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("/tools/brokerage-fee 페이지", () => {
  it("Hero 제목과 면책 안내가 렌더된다", () => {
    const { container } = render(<BrokerageFeeToolPage />);
    expect(screen.getByRole("heading", { name: "중개수수료 계산기", level: 1 })).toBeInTheDocument();
    expect(container.textContent).toMatch(/공인중개사법 시행규칙 별표1/);
    expect(container.textContent).toMatch(/관할 시·군·구청/);
  });

  it("거래유형 4종, 매물유형 3종, 부가세 2종 라디오가 렌더된다", () => {
    render(<BrokerageFeeToolPage />);
    expect(screen.getByLabelText("매매·교환")).toBeInTheDocument();
    expect(screen.getByLabelText("전세 (임대차)")).toBeInTheDocument();
    expect(screen.getByLabelText("월세")).toBeInTheDocument();
    expect(screen.getByLabelText("토지·상가 등")).toBeInTheDocument();
    expect(screen.getByLabelText("주택")).toBeInTheDocument();
    expect(screen.getByLabelText(/오피스텔 \(주거용\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/오피스텔 \(그 외\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/일반과세/)).toBeInTheDocument();
    expect(screen.getByLabelText(/간이과세/)).toBeInTheDocument();
  });

  it("초기 상태 — 결과 카드가 회색 placeholder 표시", () => {
    render(<BrokerageFeeToolPage />);
    expect(screen.getByText("거래금액을 입력하세요.")).toBeInTheDocument();
  });

  it("매매 + 5억 입력 → 총 청구액 220만원 표시 (부가세 일반)", () => {
    render(<BrokerageFeeToolPage />);
    const amount = screen.getByLabelText("거래금액 (만원)") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "50000" } });
    expect(screen.getByText("총 청구액")).toBeInTheDocument();
    // 220만원이 결과 카드 어딘가에 표시되는지 (총 청구액 = 220만원)
    expect(screen.getAllByText(/220만원/).length).toBeGreaterThan(0);
  });

  it("월세 모드 전환 → 보증금/월세 입력란이 노출된다", () => {
    render(<BrokerageFeeToolPage />);
    fireEvent.click(screen.getByLabelText("월세"));
    expect(screen.getByLabelText("보증금 (만원)")).toBeInTheDocument();
    expect(screen.getByLabelText("월세 (만원)")).toBeInTheDocument();
  });

  it("계산식 details/summary 펼침 가능", () => {
    render(<BrokerageFeeToolPage />);
    fireEvent.change(screen.getByLabelText("거래금액 (만원)"), { target: { value: "50000" } });
    expect(screen.getByText("계산식 보기")).toBeInTheDocument();
  });

  it("거래유형 변경 시 거래금액이 0으로 초기화", () => {
    render(<BrokerageFeeToolPage />);
    const amount = screen.getByLabelText("거래금액 (만원)") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "50000" } });
    expect(amount.value).toBe("50000");
    // 거래유형 라디오 변경 (월세 → 다시 매매)
    fireEvent.click(screen.getByLabelText("월세"));
    fireEvent.click(screen.getByLabelText("매매·교환"));
    const amountAgain = screen.getByLabelText("거래금액 (만원)") as HTMLInputElement;
    expect(amountAgain.value).toBe("");
  });

  it("매물유형 변경 시 거래금액이 유지된다 (결과만 갱신)", () => {
    render(<BrokerageFeeToolPage />);
    const amount = screen.getByLabelText("거래금액 (만원)") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "50000" } });
    fireEvent.click(screen.getByLabelText(/오피스텔 \(주거용\)/));
    // 매물유형 변경 후에도 입력값 유지
    expect((screen.getByLabelText("거래금액 (만원)") as HTMLInputElement).value).toBe("50000");
    // 오피스텔 주거용 매매 5억 = 250만원 수수료 + 25만원 부가세 = 총 275만원
    const result = screen.getByRole("status");
    expect(within(result).getByText("총 청구액")).toBeInTheDocument();
    expect(within(result).getAllByText(/275만원/).length).toBeGreaterThan(0);
  });

  /** 초기화 버튼 — 입력값을 마운트 초기값으로 복원 */
  it("초기화 버튼 — 거래금액·거래유형이 마운트 초기값으로 복귀", () => {
    render(<BrokerageFeeToolPage />);
    const amount = screen.getByLabelText("거래금액 (만원)") as HTMLInputElement;
    // 값 변경 + 거래유형 전환
    fireEvent.change(amount, { target: { value: "50000" } });
    fireEvent.click(screen.getByLabelText("월세"));
    // 월세 모드에서 보증금/월세 노출 확인
    expect(screen.getByLabelText("보증금 (만원)")).toBeInTheDocument();
    // 초기화
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    // 마운트 초기값 복귀: 거래유형 sale → 거래금액 단일 입력 + 빈값, placeholder 안내
    expect(screen.getByText("거래금액을 입력하세요.")).toBeInTheDocument();
    expect((screen.getByLabelText("거래금액 (만원)") as HTMLInputElement).value).toBe("");
    // 월세 전용 보증금 입력란이 사라짐 (sale 복귀 확인)
    expect(screen.queryByLabelText("보증금 (만원)")).not.toBeInTheDocument();
  });

  /** 결과 복사 버튼 (세션 265) */
  it("거래금액 입력 후 복사 버튼 클릭 → 총 청구액 + 참고용 면책 복사", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    render(<BrokerageFeeToolPage />);
    fireEvent.change(screen.getByLabelText("거래금액 (만원)"), { target: { value: "50000" } });

    fireEvent.click(screen.getByRole("button", { name: "중개수수료 결과 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("중개수수료 총 청구액");
    // 면책 문구 누락 방지 가드 (사용자 명시 요구)
    expect(copied).toContain("참고용");
  });
});
