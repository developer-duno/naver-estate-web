/**
 * 매물 즐겨찾기 모아보기 컴포넌트 테스트 — 목록·정렬·삭제·행클릭 + 빈상태
 * 실행: npx vitest run src/components/__tests__/ArticleFavoritesTab.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ArticleFavoritesTab from "@/components/ArticleFavoritesTab";
import type { FavoriteArticle } from "@/lib/storage";

/** 팩토리 — added_at 으로 정렬 검증 가능하게 시간차 부여 */
function makeFavorites(): FavoriteArticle[] {
  return [
    { article_no: "A1", complex_no: "C1", complex_name: "가나아파트", trade_type_name: "전세", price: "3억", added_at: 100 },
    { article_no: "A2", complex_no: "C2", complex_name: "다라타워", trade_type_name: "매매", price: "5억", added_at: 300 },
    { article_no: "A3", complex_no: "C3", complex_name: "마바빌", trade_type_name: "월세", price: "1억/50", added_at: 200 },
  ];
}

describe("ArticleFavoritesTab", () => {
  /** 빈상태 — 안내 문구 */
  it("즐겨찾기가 없으면 빈상태 안내가 표시된다", () => {
    render(<ArticleFavoritesTab favorites={[]} onRowClick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("즐겨찾기한 매물이 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/☆를 눌러 추가/)).toBeInTheDocument();
  });

  /** 정상 — 목록 렌더링 (단지명·거래유형·가격) */
  it("매물 목록을 단지명·거래유형·가격과 함께 렌더링한다", () => {
    render(<ArticleFavoritesTab favorites={makeFavorites()} onRowClick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("3개 매물")).toBeInTheDocument();
    expect(screen.getByText("가나아파트")).toBeInTheDocument();
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("1억/50")).toBeInTheDocument();
  });

  /** 정상 — 기본 추가일순 (최신이 맨 위) */
  it("기본 정렬은 추가일 내림차순이다", () => {
    render(<ArticleFavoritesTab favorites={makeFavorites()} onRowClick={vi.fn()} onRemove={vi.fn()} />);
    const rows = screen.getAllByRole("row").slice(1); // 헤더 제외
    // added_at: A2(300) > A3(200) > A1(100) → 다라타워 먼저
    expect(within(rows[0]).getByText("다라타워")).toBeInTheDocument();
    expect(within(rows[2]).getByText("가나아파트")).toBeInTheDocument();
  });

  /** 정상 — 단지명순 정렬 토글 */
  it("단지명순으로 정렬하면 가나다순으로 재배치된다", () => {
    render(<ArticleFavoritesTab favorites={makeFavorites()} onRowClick={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("정렬 기준"), { target: { value: "name" } });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("가나아파트")).toBeInTheDocument();
    expect(within(rows[1]).getByText("다라타워")).toBeInTheDocument();
    expect(within(rows[2]).getByText("마바빌")).toBeInTheDocument();
  });

  /** 정상 — 행 클릭 시 articleNo 콜백 */
  it("행을 클릭하면 onRowClick에 article_no가 전달된다", () => {
    const onRowClick = vi.fn();
    render(<ArticleFavoritesTab favorites={makeFavorites()} onRowClick={onRowClick} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByText("가나아파트"));
    expect(onRowClick).toHaveBeenCalledWith("A1");
  });

  /** 정상 — × 삭제 시 added_at 제외한 매물 객체 전달 */
  it("× 버튼 클릭 시 onRemove에 added_at 제외 객체가 전달되고 행 클릭은 막힌다", () => {
    const onRowClick = vi.fn();
    const onRemove = vi.fn();
    render(<ArticleFavoritesTab favorites={makeFavorites()} onRowClick={onRowClick} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("가나아파트 즐겨찾기 해제"));
    expect(onRemove).toHaveBeenCalledWith({
      article_no: "A1",
      complex_no: "C1",
      complex_name: "가나아파트",
      trade_type_name: "전세",
      price: "3억",
    });
    expect(onRowClick).not.toHaveBeenCalled(); // stopPropagation
  });
});
