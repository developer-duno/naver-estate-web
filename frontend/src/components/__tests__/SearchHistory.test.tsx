/**
 * SearchHistory 컴포넌트 테스트 — 검색 히스토리 pill 뱃지
 * 실행: npx vitest run src/components/__tests__/SearchHistory.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchHistory from "../SearchHistory";
import type { SearchHistoryItem } from "@/lib/storage";

describe("SearchHistory 컴포넌트", () => {
  const onSelect = vi.fn();
  const onRemove = vi.fn();
  const onClear = vi.fn();

  const sampleHistory: SearchHistoryItem[] = [
    { type: "keyword", keyword: "래미안", timestamp: 1000 },
    { type: "region", sido: "서울특별시", sigungu: "강남구", dong: "역삼동", timestamp: 2000 },
  ];

  /** 빈 목록이면 렌더링 안 함 */
  it("history가 비어있으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <SearchHistory history={[]} onSelect={onSelect} onRemove={onRemove} onClear={onClear} />,
    );
    expect(container.firstChild).toBeNull();
  });

  /** 키워드 검색 표시 */
  it("키워드 검색 히스토리가 표시된다", () => {
    render(
      <SearchHistory history={sampleHistory} onSelect={onSelect} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.getByText("래미안")).toBeInTheDocument();
  });

  /** 지역 검색 표시 */
  it("지역 검색 히스토리가 시도 시군구 동 형식으로 표시된다", () => {
    render(
      <SearchHistory history={sampleHistory} onSelect={onSelect} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.getByText("서울특별시 강남구 역삼동")).toBeInTheDocument();
  });

  /** pill 클릭 시 onSelect 호출 */
  it("pill 클릭 시 onSelect가 해당 항목으로 호출된다", () => {
    const selectFn = vi.fn();
    render(
      <SearchHistory history={sampleHistory} onSelect={selectFn} onRemove={onRemove} onClear={onClear} />,
    );

    fireEvent.click(screen.getByText("래미안"));
    expect(selectFn).toHaveBeenCalledWith(sampleHistory[0]);
  });

  /** x 클릭 시 onRemove 호출 */
  it("x 클릭 시 onRemove가 timestamp로 호출된다", () => {
    const removeFn = vi.fn();
    render(
      <SearchHistory history={sampleHistory} onSelect={onSelect} onRemove={removeFn} onClear={onClear} />,
    );

    const removeButtons = screen.getAllByText("x");
    fireEvent.click(removeButtons[0]);
    expect(removeFn).toHaveBeenCalledWith(1000);
  });

  /** 전체 삭제 버튼 */
  it("전체 삭제 클릭 시 onClear가 호출된다", () => {
    const clearFn = vi.fn();
    render(
      <SearchHistory history={sampleHistory} onSelect={onSelect} onRemove={onRemove} onClear={clearFn} />,
    );

    fireEvent.click(screen.getByText("전체 삭제"));
    expect(clearFn).toHaveBeenCalled();
  });
});
