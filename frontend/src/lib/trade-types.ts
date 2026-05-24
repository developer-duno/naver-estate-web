/**
 * 거래유형 매핑·유틸 함수.
 *
 * 향후 거래유형 관련 헬퍼 (코드 → 한글명, 한글명 → 코드, 표시순 정렬 등)
 * 모일 도메인명 SSOT — 답습 = lib/brokerage.ts, lib/mb-house-type.ts.
 */

/**
 * 거래유형명 → AreaPriceStat 필드 키 매핑.
 *
 * Why: 네이버 거래유형 분류는 4종 (매매/전세/월세/단기임대) 이지만
 * AreaPriceStat 스키마는 3종 (maemae/jeonse/wolse) 로 압축 — 월세·단기임대 동일 키.
 * 새 거래유형 추가 시 본 함수 1곳만 수정.
 *
 * 주의: 단기임대(B3) 의 wolse 매핑은 BE db/price_queries.py 매핑과 어긋남
 * (BE 는 단기임대 제외). 별 세션 BE-FE 매핑 정렬 PR 필요.
 */
export function tradeKey(name?: string): "maemae" | "jeonse" | "wolse" | null {
  if (!name) return null;
  if (name === "매매") return "maemae";
  if (name === "전세") return "jeonse";
  if (name === "월세" || name === "단기임대") return "wolse";
  return null;
}
