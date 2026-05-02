/**
 * 취득세 계산 타입 정의 (지방세법 + 시행령 + 지방세특례제한법 + 농특세법, 2026 기준)
 * 기존 매물 표시용 acquisition_tax (article.py / estate.ts) 와 별개의 신규 도구.
 * 매물 표시는 네이버 추정값 string, 본 도구는 사용자 입력 정확 계산 number.
 *
 * 100줄 룰 회피 사유: brokerage 패턴(통합)과 의도적 비대칭. acquisition은 5분기 +
 * EMPTY_RESULT 12줄 + 타입 5종으로 본체 100줄 위협 → 별도 파일 분리.
 */

export type AcquisitionPropertyType = "house" | "officetel-commercial";

export interface AcquisitionInput {
  amountWon: number;              // 매매가 (실거래가, 원 단위)
  propertyType: AcquisitionPropertyType;
  houses: 1 | 2 | 3;
  isRegulatedArea: boolean;
  isFirstTime: boolean;
  area_m2: number;                // 전용면적 — UI 초기값 84 (가장 흔한 매물)
}

export type AcquisitionNoticeKey =
  | "multi-house-rural"
  | "first-time-base-only"
  | "area-85-exempt"
  | "first-time-rejected"
  | "disclaimer";

export interface AcquisitionResult {
  baseTax: number;
  exemption: number;
  ruralTax: number;
  educationTax: number;
  total: number;
  effectiveRate: number;
  appliedRate: number;
  branch: "standard" | "multi-house" | "first-time" | "officetel" | "first-time-rejected" | "empty";
  area_m2: number;
  notes: AcquisitionNoticeKey[];
}

// EMPTY_RESULT — validateAmount 실패 또는 amountWon=0 시 진입점 반환
export const EMPTY_RESULT: AcquisitionResult = {
  baseTax: 0,
  exemption: 0,
  ruralTax: 0,
  educationTax: 0,
  total: 0,
  effectiveRate: 0,
  appliedRate: 0,
  branch: "empty",
  area_m2: 0,
  notes: ["disclaimer"],
};

// 면적 가드 임계값 — 상수화로 매트릭스/테스트와 일관
export const NATIONAL_HOUSING_AREA_M2 = 85;
export const DEFAULT_AREA_M2 = 84;
