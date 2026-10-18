/**
 * 미분양 단지 비교 유틸리티 — 비교표 행 정의 + 셀 포맷
 * 세션 472 PR 3: 단지 간 우위(★)·초록 강조 판정을 없앴다. 값만 나란히 보이고 출처는 페이지 맨 아래 각주에 둔다.
 */
import type { MbApartment } from "@/types";
import { displayUnits, normalizePp } from "./mb-format";
import { roadDistanceText } from "@/components/mb/basis-text";

/** 비교 테이블 한 행의 정의 — 라벨, 값 추출 함수 */
export interface MbCompareRow {
  label: string;
  getValue: (apt: MbApartment) => string | number | null | undefined;
}

/** 17행 비교 테이블 정의 — /mibunyang/compare 페이지 표·카드와 엑셀 내보내기가 같이 쓴다 */
export const MB_COMPARE_ROWS: MbCompareRow[] = [
  { label: "단지명", getValue: (a) => a.name },
  { label: "지역", getValue: (a) => [a.region, a.gu].filter(Boolean).join(" ") },
  // 미분양이 묶음 값이면 세대수도 묶음 값으로 짝을 맞춘다 (B22)
  { label: "세대수", getValue: (a) => displayUnits(a) },
  { label: "미분양", getValue: (a) => a.unsold },
  { label: "미분양률(%)", getValue: (a) => a.unsold_rate },
  { label: "6개월 취소율(%)", getValue: (a) => a.trade_stats?.cancel_ratio_6m },
  { label: "입주시기", getValue: (a) => a.presale_move_in ?? a.completion },
  { label: "분양가 최저(만원)", getValue: (a) => a.presale_min_price },
  { label: "분양가 최고(만원)", getValue: (a) => a.presale_max_price },
  // 평당가 0/미공개는 null → formatCellValue "-" (세션 300)
  { label: "평당가(만원)", getValue: (a) => normalizePp(a.presale_pp) },
  { label: "세대당 주차(대)", getValue: (a) => a.parking_ratio },
  { label: "최고층", getValue: (a) => a.max_floor },
  { label: "용적률(%)", getValue: (a) => a.floor_area_ratio },
  { label: "난방", getValue: (a) => a.heating },
  { label: "시공사", getValue: (a) => a.builder },
  { label: "할인율(%)", getValue: (a) => a.discount_pct },
  // 네이버 주변 중위가·전세가율 행은 뺐다 — 구 단위 값(세션 471 · 미분양 사장님 결정 10-17)
  // noise 는 측정값이 아니라 큰 도로 거리 구간에 붙인 추정 dB 라 상세 화면처럼 거리 구간 글로 쓴다(세션 472).
  // 70·60·50·40 밖의 값은 구간을 알 수 없어 null → "-"
  { label: "큰 도로 거리(추정)", getValue: (a) => roadDistanceText(a.noise) },
];

/** 셀 표시용 포맷 */
export function formatCellValue(val: string | number | null | undefined): string {
  if (val == null) return "-";
  if (typeof val === "number") return val.toLocaleString();
  return val || "-";
}
