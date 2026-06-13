/**
 * 미분양 표시값 정규화 헬퍼 (세션 300).
 *
 * 평당가(presale_pp)는 prod 에서 0 값이 311건(분양가 양수인데 평당가만 0 적재되는 collector
 * 결함 254건 + 둘다 미공개 57건) — 0 을 그대로 두면 정렬 첫 페이지 도배 + "평당 0만" 거짓 표시
 * + 비교 차트 거짓 우위(★최저). normalizePp 로 "0/음수/null → null" 통일.
 *
 * ⚠ 표시 sentinel(미공개를 "-"/빈문자/미렌더/제외 중 무엇으로) 은 소비처가 결정한다.
 * 이 함수는 정규화만 한다 — 테이블 "-", 엑셀 "", 차트/비교표 null, 레이더 0강제.
 */
export function normalizePp(v: number | null | undefined): number | null {
  return v != null && v > 0 ? v : null;
}
