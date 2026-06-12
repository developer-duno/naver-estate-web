/**
 * MbSortSelect 회귀 가드 — 모바일 정렬 select (세션 296)
 * + mb-sort-options ↔ backend/routers/mb.py:35-41 Literal 짝꿍 정확 일치 가드
 *   (기존 페이지 테스트는 3값만 사용해 옵션 멤버십 축소를 못 잡는 사각 — toEqual 전수 대조)
 * 실행: npx vitest run src/components/mb/__tests__/MbSortSelect.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbSortSelect from "../MbSortSelect";
import { MB_APT_SORT_OPTIONS, MB_TRADE_SORT_OPTIONS } from "@/lib/mb-sort-options";

describe("MbSortSelect", () => {
  // 옵션 + 빈 값 기본 라벨이 전부 렌더된다
  it("기본 라벨 + 옵션 전체 렌더", () => {
    render(
      <MbSortSelect sort="" onSortChange={() => {}} options={MB_APT_SORT_OPTIONS} defaultLabel="기본 (단지명순)" />
    );
    const select = screen.getByLabelText("목록 정렬") as HTMLSelectElement;
    expect(select.options).toHaveLength(MB_APT_SORT_OPTIONS.length + 1);
    expect(screen.getByText("기본 (단지명순)")).toBeInTheDocument();
    expect(screen.getByText("미분양 많은순")).toBeInTheDocument();
  });

  // 옵션 선택 시 onSortChange 에 BE 유효값이 전달된다
  it("옵션 변경 → onSortChange(값) 호출", () => {
    const onChange = vi.fn();
    render(
      <MbSortSelect sort="" onSortChange={onChange} options={MB_APT_SORT_OPTIONS} defaultLabel="기본" />
    );
    fireEvent.change(screen.getByLabelText("목록 정렬"), { target: { value: "unsold_desc" } });
    expect(onChange).toHaveBeenCalledWith("unsold_desc");
  });

  // 기본 라벨 재선택 시 빈 값("") 전달 = sort_by 파라미터 제거 경로
  it("기본 라벨 선택 → onSortChange('')", () => {
    const onChange = vi.fn();
    render(
      <MbSortSelect sort="price_asc" onSortChange={onChange} options={MB_APT_SORT_OPTIONS} defaultLabel="기본" />
    );
    fireEvent.change(screen.getByLabelText("목록 정렬"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  // URL sort 값이 select 표시값에 반영된다 (controlled)
  it("sort prop 이 선택 상태로 반영", () => {
    render(
      <MbSortSelect sort="unsold_rate_desc" onSortChange={() => {}} options={MB_APT_SORT_OPTIONS} defaultLabel="기본" />
    );
    expect((screen.getByLabelText("목록 정렬") as HTMLSelectElement).value).toBe("unsold_rate_desc");
  });
});

describe("mb-sort-options ↔ BE Literal 짝꿍 가드 (mb.py:35-41)", () => {
  // BE MbAptSortBy Literal 9값과 정확 일치 — 옵션 큐레이션/기계 조합으로 인한
  // whitelist 무음 축소·422 재발(units_asc 류) 차단. BE Literal 변경 시 양쪽 답습.
  it("APT 옵션 = MbAptSortBy 9값 verbatim", () => {
    expect(MB_APT_SORT_OPTIONS.map((o) => o.v)).toEqual([
      "name_asc", "unsold_desc", "unsold_asc", "unsold_rate_desc",
      "units_desc", "price_asc", "price_desc", "pp_asc", "pp_desc",
    ]);
  });

  it("TRADE 옵션 = MbTradeSortBy 5값 verbatim", () => {
    expect(MB_TRADE_SORT_OPTIONS.map((o) => o.v)).toEqual([
      "deal_month_desc", "deal_month_asc", "price_desc", "price_asc", "area_desc",
    ]);
  });
});
