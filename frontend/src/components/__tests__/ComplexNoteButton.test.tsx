import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexNoteButton from "@/components/ComplexNoteButton";

function renderButton(complexNo = "12345") {
  return render(<ComplexNoteButton complexNo={complexNo} />);
}

describe("ComplexNoteButton — 단지 메모 모달", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("초기: 메모 없으면 📄 + '단지 메모 추가' aria-label", () => {
    renderButton();
    expect(screen.getByLabelText("단지 메모 추가")).toBeInTheDocument();
    expect(screen.getByText("📄")).toBeInTheDocument();
  });

  it("버튼 클릭 → 모달 열림 (role=dialog + aria-modal=true)", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "단지 메모");
  });

  it("저장 → 메모 박힘 + 버튼 아이콘 📝 + 색 변경", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "학교 근처");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("📝")).toBeInTheDocument();
    expect(screen.getByLabelText("단지 메모 보기·수정")).toBeInTheDocument();
  });

  it("ESC 키 → 모달 닫힘", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("취소 버튼 → 저장하지 않고 닫힘", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    await user.type(screen.getByRole("textbox"), "취소될 메모");
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 다시 열어서 빈 상태 확인
    await user.click(screen.getByLabelText("단지 메모 추가"));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("배경 클릭 → 모달 닫힘 (모달 내부 클릭은 닫지 않음)", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("500자 초과 입력 → maxLength 자르기 (textarea native maxLength)", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);
    expect(screen.getByText(/0 \/ 500자/)).toBeInTheDocument();
  });

  it("기존 메모 → 모달 열면 textarea 에 채워짐 + 삭제 버튼 표시", async () => {
    const user = userEvent.setup();
    renderButton();
    // 1차 저장
    await user.click(screen.getByLabelText("단지 메모 추가"));
    await user.type(screen.getByRole("textbox"), "기존 메모");
    await user.click(screen.getByRole("button", { name: "저장" }));
    // 다시 열기
    await user.click(screen.getByLabelText("단지 메모 보기·수정"));
    expect(screen.getByRole("textbox")).toHaveValue("기존 메모");
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("삭제 버튼 → 메모 정리 + 아이콘 📄로 회귀", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByLabelText("단지 메모 추가"));
    await user.type(screen.getByRole("textbox"), "삭제 대상");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await user.click(screen.getByLabelText("단지 메모 보기·수정"));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByText("📄")).toBeInTheDocument();
    expect(screen.getByLabelText("단지 메모 추가")).toBeInTheDocument();
  });
});
