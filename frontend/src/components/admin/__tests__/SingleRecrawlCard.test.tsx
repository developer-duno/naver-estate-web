/**
 * SingleRecrawlCard 컴포넌트 테스트 — 단건 강제 재크롤 카드
 * 실행: npx vitest run src/components/admin/__tests__/SingleRecrawlCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SingleRecrawlCard from "../SingleRecrawlCard";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  triggerSingleRecrawl: vi.fn(),
}));

import { triggerSingleRecrawl } from "@/lib/api";
const mockTrigger = vi.mocked(triggerSingleRecrawl);

const getToken = vi.fn().mockResolvedValue("test-token");

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <SingleRecrawlCard getToken={getToken} />
    </TestQueryProvider>,
  );
}

describe("SingleRecrawlCard 컴포넌트", () => {
  /** 카드 제목 + 입력 필드가 렌더되는지 */
  it("제목과 입력 필드가 표시된다", () => {
    renderWithProvider();
    expect(screen.getByText("단건 강제 재크롤")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("단지번호 (예: 12345)"),
    ).toBeInTheDocument();
    expect(screen.getByText("지금 재크롤")).toBeInTheDocument();
  });

  /** 빈 값으로 트리거 시 버튼 disabled — API 호출 안 됨 */
  it("빈 입력에서는 버튼이 비활성화된다", () => {
    renderWithProvider();
    const button = screen.getByText("지금 재크롤") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  /** 숫자 아닌 값 입력 → client-side 에러 메시지 */
  it("숫자 아닌 complex_no 입력 시 클라이언트 검증 에러", async () => {
    renderWithProvider();
    const input = screen.getByPlaceholderText(
      "단지번호 (예: 12345)",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByText("지금 재크롤"));
    await waitFor(() => {
      expect(screen.getByText("숫자 1~20자리만 허용됩니다")).toBeInTheDocument();
    });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  /** 정상 트리거 → API 호출 + 성공 메시지 */
  it("유효한 complex_no 입력 시 API 호출 + 성공 메시지", async () => {
    mockTrigger.mockResolvedValueOnce({
      status: "started",
      complex_no: "12345",
      complex_name: "테스트단지",
    });
    renderWithProvider();
    const input = screen.getByPlaceholderText(
      "단지번호 (예: 12345)",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.click(screen.getByText("지금 재크롤"));

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith("test-token", "12345", false);
    });
    await waitFor(() => {
      expect(
        screen.getByText(/테스트단지.*12345.*재크롤 시작됨/),
      ).toBeInTheDocument();
    });
  });

  /** API 409 에러 → 에러 메시지 표시 */
  it("API 에러 응답 시 에러 메시지 표시", async () => {
    mockTrigger.mockRejectedValueOnce(
      new Error("이 단지는 1시간 내에 이미 재크롤된 이력이 있습니다"),
    );
    renderWithProvider();
    const input = screen.getByPlaceholderText(
      "단지번호 (예: 12345)",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99999" } });
    fireEvent.click(screen.getByText("지금 재크롤"));

    await waitFor(() => {
      expect(
        screen.getByText(/1시간 내에 이미 재크롤된 이력/),
      ).toBeInTheDocument();
    });
  });
});
