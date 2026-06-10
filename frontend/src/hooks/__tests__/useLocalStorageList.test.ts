/**
 * useLocalStorageList 제네릭 훅 테스트 — localStorage 기반 리스트 관리
 * 실행: npx vitest run src/hooks/__tests__/useLocalStorageList.test.ts
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorageList } from "../useLocalStorageList";

interface TestItem {
  id: string;
  label: string;
}

const config = {
  storageKey: "test_list",
  getId: (item: TestItem) => item.id,
  maxItems: 3,
};

describe("useLocalStorageList 제네릭 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** quota 초과(setItem throw) 시 crash 없이 메모리 상태만 갱신 — safeSetItem 가드 (s288) */
  it("localStorage.setItem이 quota로 throw해도 add가 crash 없이 메모리 상태를 갱신한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    let returned: boolean | undefined;
    act(() => {
      returned = result.current.add({ id: "1", label: "A" });
    });
    // throw 전파 없이 add 성공 반환 + 메모리 목록 갱신 (저장만 실패)
    expect(returned).toBe(true);
    expect(result.current.list).toHaveLength(1);
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 목록을 반환한다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    expect(result.current.list).toEqual([]);
    expect(result.current.isFull).toBe(false);
  });

  /** add로 항목 추가 */
  it("add로 항목을 추가할 수 있다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
    });
    expect(result.current.list).toHaveLength(1);
    expect(result.current.isIn("1")).toBe(true);
  });

  /** remove로 항목 제거 */
  it("remove로 항목을 제거할 수 있다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
    });
    act(() => {
      result.current.remove("1");
    });
    expect(result.current.list).toHaveLength(0);
    expect(result.current.isIn("1")).toBe(false);
  });

  /** toggle 추가/제거 */
  it("toggle로 추가/제거를 반복할 수 있다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.toggle({ id: "1", label: "A" });
    });
    expect(result.current.isIn("1")).toBe(true);
    act(() => {
      result.current.toggle({ id: "1", label: "A" });
    });
    expect(result.current.isIn("1")).toBe(false);
  });

  /** maxItems 제약 */
  it("maxItems 초과 시 add가 false를 반환한다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
      result.current.add({ id: "2", label: "B" });
      result.current.add({ id: "3", label: "C" });
    });
    expect(result.current.isFull).toBe(true);
    let added: boolean | undefined;
    act(() => {
      added = result.current.add({ id: "4", label: "D" });
    });
    expect(added).toBe(false);
    expect(result.current.list).toHaveLength(3);
  });

  /** 중복 추가 방지 */
  it("같은 ID를 중복 추가하면 false를 반환한다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
    });
    let added: boolean | undefined;
    act(() => {
      added = result.current.add({ id: "1", label: "A" });
    });
    expect(added).toBe(false);
    expect(result.current.list).toHaveLength(1);
  });

  /** clear로 전체 초기화 */
  it("clear로 목록을 비울 수 있다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
      result.current.add({ id: "2", label: "B" });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.list).toHaveLength(0);
    expect(localStorage.getItem("test_list")).toBeNull();
  });

  /** 깨진 JSON 방어 */
  it("localStorage에 유효하지 않은 JSON이 있으면 빈 배열을 반환한다", () => {
    localStorage.setItem("test_list", "broken-json{");
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    expect(result.current.list).toEqual([]);
  });

  /** localStorage 영속성 확인 */
  it("add 후 localStorage에 데이터가 저장된다", () => {
    const { result } = renderHook(() => useLocalStorageList<TestItem>(config));
    act(() => {
      result.current.add({ id: "1", label: "A" });
    });
    const stored = JSON.parse(localStorage.getItem("test_list") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("1");
  });
});
