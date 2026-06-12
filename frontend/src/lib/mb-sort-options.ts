/**
 * 미분양 정렬 옵션 SSOT — backend/routers/mb.py:35-41 MbAptSortBy/MbTradeSortBy Literal 과 짝꿍.
 * BE Literal 멤버를 verbatim 전수 나열한다 (컬럼×방향 기계 조합 금지 — units_asc 등
 * BE 미지원 값이 생성되면 422, 세션 295 PR #155 사고 재발).
 * 새 정렬 추가 시 본 파일 + BE Literal 양쪽 답습 (.claude/rules/domain-mapping-ssot.md 룰 1).
 * 소비처: 모바일 MbSortSelect 옵션 + mibunyang/page.tsx 탭 전환 whitelist (derive).
 */

/** 아파트 정렬 (미분양 단지·미분양만 탭 공용).
 * price 라벨 주의: BE 는 평당가(presale_pp)가 아니라 분양가 최저 절대값(presale_min_price)
 * 정렬 (db/mb_query_helpers.py _build_mb_order_clause) — 라벨도 "분양가" 가 정직.
 * 데스크톱 SortableTh "평당가" 헤더는 기존 mislabel (별도 후속 정정 백로그). */
export const MB_APT_SORT_OPTIONS: { v: string; l: string }[] = [
  { v: "name_asc", l: "단지명순" },
  { v: "unsold_desc", l: "미분양 많은순" },
  { v: "unsold_asc", l: "미분양 적은순" },
  { v: "unsold_rate_desc", l: "미분양률 높은순" },
  { v: "units_desc", l: "세대수 많은순" },
  { v: "price_asc", l: "분양가 낮은순" },
  { v: "price_desc", l: "분양가 높은순" },
];

/** 실거래 정렬 (실거래 탭) */
export const MB_TRADE_SORT_OPTIONS: { v: string; l: string }[] = [
  { v: "deal_month_desc", l: "최근 거래월순" },
  { v: "deal_month_asc", l: "오래된 거래월순" },
  { v: "price_desc", l: "가격 높은순" },
  { v: "price_asc", l: "가격 낮은순" },
  { v: "area_desc", l: "면적 넓은순" },
];
