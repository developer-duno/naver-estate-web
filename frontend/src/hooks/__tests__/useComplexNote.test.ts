import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useComplexNote } from "@/hooks/useComplexNote";

describe("useComplexNote — 단지 메모 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("초기 상태: 저장된 메모 없으면 빈 문자열", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.maxLen).toBe(500);
  });

  it("save → note 즉시 갱신 + localStorage 저장", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    act(() => result.current.save("학교 근처, 시세 상승세"));
    expect(result.current.note).toBe("학교 근처, 시세 상승세");
    expect(result.current.updatedAt).not.toBeNull();
  });

  it("save 빈 문자열 → 메모 삭제 (note='', updatedAt=null)", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    act(() => result.current.save("초기 메모"));
    act(() => result.current.save(""));
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
  });

  it("save 500자 초과 → 500자에서 잘림", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    const longText = "가".repeat(600);
    act(() => result.current.save(longText));
    expect(result.current.note.length).toBe(500);
  });

  it("save trim → 앞뒤 공백 제거, 빈 값이면 삭제", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    act(() => result.current.save("   "));
    expect(result.current.note).toBe("");
    act(() => result.current.save("  메모  "));
    expect(result.current.note).toBe("메모");
  });

  it("clear → 메모 삭제 + localStorage 정리", () => {
    const { result } = renderHook(() => useComplexNote("12345"));
    act(() => result.current.save("메모"));
    act(() => result.current.clear());
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
  });

  it("complexNo 변경 → 해당 단지 메모로 다시 로드", () => {
    const { result, rerender } = renderHook(
      ({ no }) => useComplexNote(no),
      { initialProps: { no: "12345" } },
    );
    act(() => result.current.save("단지 A 메모"));
    rerender({ no: "67890" });
    expect(result.current.note).toBe("");
    rerender({ no: "12345" });
    expect(result.current.note).toBe("단지 A 메모");
  });

  it("빈 complexNo → 저장 시도해도 영향 없음 (방어)", () => {
    const { result } = renderHook(() => useComplexNote(""));
    expect(result.current.note).toBe("");
  });
});
