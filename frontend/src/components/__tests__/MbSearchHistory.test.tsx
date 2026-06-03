/**
 * MbSearchHistory 컴포넌트 테스트
 * 실행: npx vitest run src/components/__tests__/MbSearchHistory.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbSearchHistory from "../mb/MbSearchHistory";
import type { MbSearchHistoryItem } from "@/lib/storage";

function makeItem(
  region: string,
  gu?: string,
  keyword?: string,
  timestamp = Date.now(),
): MbSearchHistoryItem {
  return { region, gu, keyword, timestamp };
}

describe("MbSearchHistory 컴포넌트", () => {
  /** 빈 히스토리 → 렌더 안 함 */
  it("히스토리가 비어있으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <MbSearchHistory history={[]} onSelect={vi.fn()} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  /** pill 뱃지 렌더 */
  it("히스토리 항목을 pill 뱃지로 렌더한다", () => {
    const items = [makeItem("서울", "강남구", undefined, 1), makeItem("경기", undefined, "래미안", 2)];
    render(
      <MbSearchHistory history={items} onSelect={vi.fn()} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText("서울 강남구")).toBeInTheDocument();
    expect(screen.getByText("경기 '래미안'")).toBeInTheDocument();
  });

  /** 라벨 포맷 — region만 */
  it("region만 있으면 region만 표시한다", () => {
    render(
      <MbSearchHistory
        history={[makeItem("서울")]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("서울")).toBeInTheDocument();
  });

  /** 라벨 포맷 — region + gu + keyword */
  it("region + gu + keyword를 올바르게 포맷한다", () => {
    render(
      <MbSearchHistory
        history={[makeItem("서울", "강남구", "래미안")]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("서울 강남구 '래미안'")).toBeInTheDocument();
  });

  /** pill 클릭 → onSelect 호출 */
  it("pill 클릭 시 onSelect가 올바른 아이템으로 호출된다", () => {
    const onSelect = vi.fn();
    const item = makeItem("서울", "강남구", undefined, 100);
    render(
      <MbSearchHistory history={[item]} onSelect={onSelect} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("서울 강남구"));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  /** X 버튼 → onRemove 호출 */
  it("X 버튼 클릭 시 onRemove가 해당 timestamp로 호출된다", () => {
    const onRemove = vi.fn();
    render(
      <MbSearchHistory
        history={[makeItem("서울", undefined, undefined, 999)]}
        onSelect={vi.fn()}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("×"));
    expect(onRemove).toHaveBeenCalledWith(999);
  });

  /** 접근성 회귀 가드 — 삭제 버튼에 검색 라벨 포함 aria-label */
  it("삭제 버튼에 검색 라벨을 포함한 aria-label이 있다", () => {
    render(
      <MbSearchHistory
        history={[makeItem("서울", "강남구", "래미안", 1)]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("서울 강남구 '래미안' 검색 기록 삭제")).toBeInTheDocument();
  });

  /** 전체 삭제 → onClear 호출 */
  it("전체 삭제 버튼 클릭 시 onClear가 호출된다", () => {
    const onClear = vi.fn();
    render(
      <MbSearchHistory
        history={[makeItem("서울")]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("전체 삭제"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  /** "최근 검색" 라벨 표시 */
  it("최근 검색 라벨이 표시된다", () => {
    render(
      <MbSearchHistory
        history={[makeItem("서울")]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("최근 검색")).toBeInTheDocument();
  });
});
