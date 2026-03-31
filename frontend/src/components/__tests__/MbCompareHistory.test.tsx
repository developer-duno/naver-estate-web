/**
 * MbCompareHistory 컴포넌트 테스트
 * 실행: npx vitest run src/components/__tests__/MbCompareHistory.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbCompareHistory from "../mb/MbCompareHistory";
import type { MbCompareHistoryItem, MbCompareBookmarkItem } from "@/lib/storage";

function makeHistory(ids: string[], names: string[], timestamp = Date.now()): MbCompareHistoryItem {
  return { ids, names, timestamp };
}

function makeBookmark(
  ids: string[],
  names: string[],
  label?: string,
  saved_at = Date.now(),
): MbCompareBookmarkItem {
  return { ids, names, label, saved_at };
}

describe("MbCompareHistory 컴포넌트", () => {
  /** 빈 상태 → 렌더 안 함 */
  it("히스토리와 북마크가 비어있으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(
      <MbCompareHistory
        history={[]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  /** 히스토리 pill 렌더 */
  it("히스토리 항목을 pill 뱃지로 렌더한다", () => {
    const items = [makeHistory(["A1", "A2"], ["단지1", "단지2"], 1)];
    render(
      <MbCompareHistory
        history={items}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(screen.getByText("단지1 vs 단지2")).toBeInTheDocument();
    expect(screen.getByText("최근 비교")).toBeInTheDocument();
  });

  /** 히스토리 pill 클릭 → onSelectHistory 호출 */
  it("히스토리 pill 클릭 시 onSelectHistory가 호출된다", () => {
    const onSelect = vi.fn();
    const item = makeHistory(["A1", "A2"], ["단지1", "단지2"], 100);
    render(
      <MbCompareHistory
        history={[item]}
        onSelectHistory={onSelect}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("단지1 vs 단지2"));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  /** X 버튼 → onRemoveHistory 호출 */
  it("히스토리 X 버튼 클릭 시 onRemoveHistory가 호출된다", () => {
    const onRemove = vi.fn();
    render(
      <MbCompareHistory
        history={[makeHistory(["A1", "A2"], ["단지1", "단지2"], 999)]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={onRemove}
        onClearHistory={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("×"));
    expect(onRemove).toHaveBeenCalledWith(999);
  });

  /** 전체 삭제 → onClearHistory 호출 */
  it("전체 삭제 버튼 클릭 시 onClearHistory가 호출된다", () => {
    const onClear = vi.fn();
    render(
      <MbCompareHistory
        history={[makeHistory(["A1", "A2"], ["단지1", "단지2"])]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={onClear}
      />,
    );
    fireEvent.click(screen.getByText("전체 삭제"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  /** 북마크 pill 렌더 */
  it("북마크 항목을 amber pill로 렌더한다", () => {
    render(
      <MbCompareHistory
        history={[]}
        bookmarks={[makeBookmark(["A1", "A2"], ["단지1", "단지2"], "내 비교", 1)]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
      />,
    );
    expect(screen.getByText(/내 비교/)).toBeInTheDocument();
    expect(screen.getByText("저장된 비교")).toBeInTheDocument();
  });

  /** 북마크 pill 클릭 → onSelectBookmark 호출 */
  it("북마크 pill 클릭 시 onSelectBookmark가 호출된다", () => {
    const onSelect = vi.fn();
    const bookmark = makeBookmark(["A1", "A2"], ["단지1", "단지2"], "내 비교", 200);
    render(
      <MbCompareHistory
        history={[]}
        bookmarks={[bookmark]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
        onSelectBookmark={onSelect}
        onRemoveBookmark={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/내 비교/));
    expect(onSelect).toHaveBeenCalledWith(bookmark);
  });

  /** 북마크 없이 히스토리만 표시 */
  it("bookmarks를 전달하지 않으면 히스토리 섹션만 렌더한다", () => {
    render(
      <MbCompareHistory
        history={[makeHistory(["A1", "A2"], ["단지1", "단지2"])]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(screen.getByText("최근 비교")).toBeInTheDocument();
    expect(screen.queryByText("저장된 비교")).not.toBeInTheDocument();
  });

  /** 북마크 X 버튼 → onRemoveBookmark 호출 */
  it("북마크 X 버튼 클릭 시 onRemoveBookmark가 호출된다", () => {
    const onRemove = vi.fn();
    render(
      <MbCompareHistory
        history={[]}
        bookmarks={[makeBookmark(["A1", "A2"], ["단지1", "단지2"], "내 비교", 777)]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={onRemove}
      />,
    );
    fireEvent.click(screen.getByText("×"));
    expect(onRemove).toHaveBeenCalledWith(777);
  });

  /** 북마크 전체 삭제 → onClearBookmarks 호출 */
  it("북마크 전체 삭제 버튼 클릭 시 onClearBookmarks가 호출된다", () => {
    const onClear = vi.fn();
    render(
      <MbCompareHistory
        history={[]}
        bookmarks={[makeBookmark(["A1", "A2"], ["단지1", "단지2"], "내 비교")]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onClearBookmarks={onClear}
      />,
    );
    const buttons = screen.getAllByText("전체 삭제");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  /** onClearBookmarks 미전달 시 북마크 전체 삭제 버튼 미표시 */
  it("onClearBookmarks 미전달 시 북마크 전체 삭제 버튼이 표시되지 않는다", () => {
    render(
      <MbCompareHistory
        history={[]}
        bookmarks={[makeBookmark(["A1", "A2"], ["단지1", "단지2"], "내 비교")]}
        onSelectHistory={vi.fn()}
        onRemoveHistory={vi.fn()}
        onClearHistory={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
      />,
    );
    const buttons = screen.queryAllByText("전체 삭제");
    expect(buttons).toHaveLength(0);
  });
});
