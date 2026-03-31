/**
 * useSearchHistory 훅 테스트 — localStorage 기반 검색 히스토리
 * 실행: npx vitest run src/hooks/__tests__/useSearchHistory.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useSearchHistory 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 히스토리를 반환한다", async () => {
    const { useSearchHistory } = await import("../useSearchHistory");
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  /** add로 항목 추가 */
  it("add로 검색 히스토리에 추가할 수 있다", async () => {
    const { useSearchHistory } = await import("../useSearchHistory");
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add({ type: "keyword", keyword: "래미안" });
    });

    expect(result.current.history.length).toBeGreaterThanOrEqual(1);
  });

  /** remove로 항목 제거 */
  it("remove로 특정 히스토리를 제거할 수 있다", async () => {
    const { useSearchHistory } = await import("../useSearchHistory");
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add({ type: "keyword", keyword: "래미안" });
    });
    const ts = result.current.history[0]?.timestamp;
    if (ts) {
      act(() => {
        result.current.remove(ts);
      });
    }

    expect(result.current.history).toHaveLength(0);
  });

  /** clear로 전체 초기화 */
  it("clear로 히스토리를 비울 수 있다", async () => {
    const { useSearchHistory } = await import("../useSearchHistory");
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add({ type: "keyword", keyword: "래미안" });
      result.current.add({ type: "keyword", keyword: "힐스테이트" });
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toHaveLength(0);
  });

  /** 지역 검색 추가 */
  it("지역 타입 검색 히스토리를 추가할 수 있다", async () => {
    const { useSearchHistory } = await import("../useSearchHistory");
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.add({ type: "region", sido: "서울특별시", sigungu: "강남구", dong: "역삼동" });
    });

    expect(result.current.history.length).toBeGreaterThanOrEqual(1);
  });
});
