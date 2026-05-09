/**
 * ArticleFavoriteButton 단위 테스트
 * 실행: npx vitest run src/components/__tests__/ArticleStorageButtons.test.tsx
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArticleFavoriteButton from "@/components/ArticleFavoriteButton";

beforeEach(() => {
  localStorage.clear();
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
