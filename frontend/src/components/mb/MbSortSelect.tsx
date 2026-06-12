"use client";

/**
 * 미분양 모바일 정렬 select — 데스크톱 SortableTh(hidden md:block 테이블)가 휴대폰에서
 * 안 보여 정렬 수단이 없던 갭 해소 (세션 296). md:hidden 으로 모바일 한정 노출.
 * options 는 lib/mb-sort-options.ts (BE Literal verbatim) 만 주입 — 임의 값 금지 (422 방지).
 * 빈 값("")은 sort_by 파라미터 생략 = BE 기본 정렬. 기본값이 탭마다 달라(name_asc /
 * unsold_desc / deal_month_desc) defaultLabel 로 탭별 정직 표기.
 */
export default function MbSortSelect({
  sort,
  onSortChange,
  options,
  defaultLabel,
}: {
  sort: string;
  onSortChange: (s: string) => void;
  options: { v: string; l: string }[];
  defaultLabel: string;
}) {
  return (
    <select
      value={sort}
      onChange={(e) => onSortChange(e.target.value)}
      className="md:hidden border border-gray-300 rounded-md px-2 py-2 text-xs text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      aria-label="목록 정렬"
    >
      <option value="">{defaultLabel}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
