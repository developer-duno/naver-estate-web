/**
 * ArticleNoteButton + ArticleFavoriteButton 단위 테스트
 * 실행: npx vitest run src/components/__tests__/ArticleStorageButtons.test.tsx
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleNoteButton from "@/components/ArticleNoteButton";
import ArticleFavoriteButton from "@/components/ArticleFavoriteButton";

beforeEach(() => {
  localStorage.clear();
});

describe("ArticleNoteButton — 매물 메모 모달", () => {
  it("초기: 메모 없으면 📄 + '매물 메모 추가' aria-label", () => {
    render(<ArticleNoteButton articleNo="A1" />);
    expect(screen.getByLabelText("매물 메모 추가")).toBeInTheDocument();
    expect(screen.getByText("📄")).toBeInTheDocument();
  });

  it("버튼 클릭 → 모달 열림 (role=dialog + aria-modal=true + aria-label 매물 메모)", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "매물 메모");
  });

  it("저장 → 메모 박힘 + 버튼 아이콘 📝", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    await user.type(screen.getByRole("textbox"), "손님 김○○ 관심");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("📝")).toBeInTheDocument();
    expect(screen.getByLabelText("매물 메모 보기·수정")).toBeInTheDocument();
  });

  it("ESC 키 → 모달 닫힘", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("취소 버튼 → 저장하지 않고 닫힘", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    await user.type(screen.getByRole("textbox"), "취소될 메모");
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("매물 메모 추가"));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("기존 메모 → 모달 열면 textarea 에 채워짐 + 삭제 버튼 표시", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    await user.type(screen.getByRole("textbox"), "기존 메모");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await user.click(screen.getByLabelText("매물 메모 보기·수정"));
    expect(screen.getByRole("textbox")).toHaveValue("기존 메모");
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("삭제 버튼 → 메모 정리 + 아이콘 📄로 회귀", async () => {
    const user = userEvent.setup();
    render(<ArticleNoteButton articleNo="A1" />);
    await user.click(screen.getByLabelText("매물 메모 추가"));
    await user.type(screen.getByRole("textbox"), "삭제 대상");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await user.click(screen.getByLabelText("매물 메모 보기·수정"));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByText("📄")).toBeInTheDocument();
  });
});

describe("ArticleFavoriteButton — 매물 즐겨찾기 토글", () => {
  it("초기: ☆ + aria-pressed false + '매물 즐겨찾기 추가' label", () => {
    render(
      <ArticleFavoriteButton
        articleNo="A1"
        complexNo="C1"
        complexName="래미안"
        tradeTypeName="매매"
        price="15억"
      />,
    );
    const btn = screen.getByLabelText("매물 즐겨찾기 추가");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("☆")).toBeInTheDocument();
  });

  it("클릭 → ★ + aria-pressed true + '해제' label", async () => {
    const user = userEvent.setup();
    render(
      <ArticleFavoriteButton
        articleNo="A1"
        complexNo="C1"
        complexName="래미안"
      />,
    );
    await user.click(screen.getByLabelText("매물 즐겨찾기 추가"));
    expect(screen.getByText("★")).toBeInTheDocument();
    expect(screen.getByLabelText("매물 즐겨찾기 해제")).toBeInTheDocument();
  });

  it("두 번 클릭 → 다시 ☆ (해제)", async () => {
    const user = userEvent.setup();
    render(<ArticleFavoriteButton articleNo="A1" complexNo="C1" />);
    const btn = screen.getByLabelText("매물 즐겨찾기 추가");
    await user.click(btn);
    await user.click(screen.getByLabelText("매물 즐겨찾기 해제"));
    expect(screen.getByText("☆")).toBeInTheDocument();
  });
});
