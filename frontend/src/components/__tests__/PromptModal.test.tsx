/**
 * PromptModal 컴포넌트 테스트 — 텍스트 입력 모달
 * 실행: npx vitest run src/components/__tests__/PromptModal.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PromptModal from "../PromptModal";

describe("PromptModal 컴포넌트", () => {
  const defaultProps = {
    isOpen: true,
    title: "테스트 모달",
    placeholder: "입력해주세요",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  /** isOpen=false이면 렌더링하지 않음 */
  it("isOpen=false이면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <PromptModal {...defaultProps} isOpen={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  /** isOpen=true이면 모달이 표시됨 */
  it("isOpen=true이면 제목과 입력 필드가 표시된다", () => {
    render(<PromptModal {...defaultProps} />);
    expect(screen.getByText("테스트 모달")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("입력해주세요")).toBeInTheDocument();
  });

  /** 확인 버튼 클릭 시 onConfirm 호출 */
  it("확인 버튼 클릭 시 입력값으로 onConfirm을 호출한다", () => {
    const onConfirm = vi.fn();
    render(<PromptModal {...defaultProps} onConfirm={onConfirm} />);

    const input = screen.getByPlaceholderText("입력해주세요");
    fireEvent.change(input, { target: { value: "테스트 값" } });
    fireEvent.click(screen.getByText("확인"));

    expect(onConfirm).toHaveBeenCalledWith("테스트 값");
  });

  /** 빈 값으로 확인 가능 */
  it("빈 값으로도 확인할 수 있다", () => {
    const onConfirm = vi.fn();
    render(<PromptModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText("확인"));

    expect(onConfirm).toHaveBeenCalledWith("");
  });

  /** 취소 버튼 클릭 시 onCancel 호출 */
  it("취소 버튼 클릭 시 onCancel을 호출한다", () => {
    const onCancel = vi.fn();
    render(<PromptModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("취소"));

    expect(onCancel).toHaveBeenCalled();
  });

  /** ESC 키로 닫기 */
  it("ESC 키를 누르면 onCancel을 호출한다", () => {
    const onCancel = vi.fn();
    render(<PromptModal {...defaultProps} onCancel={onCancel} />);

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
  });

  /** Enter 키로 확인 */
  it("Enter 키를 누르면 입력값으로 onConfirm을 호출한다", () => {
    const onConfirm = vi.fn();
    render(<PromptModal {...defaultProps} onConfirm={onConfirm} />);

    const input = screen.getByPlaceholderText("입력해주세요");
    fireEvent.change(input, { target: { value: "엔터 값" } });

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledWith("엔터 값");
  });

  /** 오버레이 클릭으로 닫기 */
  it("오버레이 클릭 시 onCancel을 호출한다", () => {
    const onCancel = vi.fn();
    render(<PromptModal {...defaultProps} onCancel={onCancel} />);

    // 오버레이는 dialog의 부모 요소
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.click(overlay);

    expect(onCancel).toHaveBeenCalled();
  });

  /** aria 속성 확인 */
  it("dialog role과 aria-modal 속성이 있다", () => {
    render(<PromptModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "테스트 모달");
  });
});
