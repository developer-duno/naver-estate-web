/**
 * CopyButton 컴포넌트 테스트 — 클립보드 복사 + 피드백 + 실패 graceful
 * 실행: npx vitest run src/components/__tests__/CopyButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CopyButton from "../CopyButton";

// sonner 토스트 모킹 (jsdom 에 Toaster 미마운트)
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => toastSuccess(msg),
    error: (msg: string) => toastError(msg),
  },
}));

// navigator.clipboard.writeText 모킹 헬퍼
function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("CopyButton 컴포넌트", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  /** 정상: 클릭 시 주어진 text 로 writeText 호출 */
  it("클릭하면 전달된 text 를 클립보드에 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyButton text="보유세 총 부담: 1,234,000원" />);

    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("보유세 총 부담: 1,234,000원"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  /** 피드백: 복사 성공 후 "복사됨" 라벨로 전환 */
  it("복사 성공 후 버튼이 복사됨 상태로 바뀐다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyButton text="84㎡ = 25.4평" />);

    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));

    await waitFor(() => expect(screen.getByText("복사됨")).toBeInTheDocument());
  });

  /** 에러: writeText reject 시 throw 하지 않고 에러 토스트 (graceful) */
  it("복사 실패 시 에러 토스트만 띄우고 throw 하지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    mockClipboard(writeText);
    render(<CopyButton text="x" />);

    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  /** 커스텀 aria-label 적용 */
  it("label prop 으로 접근성 라벨을 바꿀 수 있다", () => {
    render(<CopyButton text="x" label="세금 결과 복사" />);
    expect(screen.getByRole("button", { name: "세금 결과 복사" })).toBeInTheDocument();
  });
});
