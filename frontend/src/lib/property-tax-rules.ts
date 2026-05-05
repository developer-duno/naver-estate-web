/**
 * 보유세 입력 정규화 (clamp + corp 강제).
 * 9 GATE 5 정정으로 신설 — UI 우회·URL 조작·극단값 방어 단일 책임.
 * - excludedHouses: 0 ≤ x ≤ houses 로 clamp (음수 → 0, houses 초과 → houses)
 * - ownershipRatio: 0 < x ≤ 1 로 clamp (0/음수 → 1, Infinity/NaN → 1, 1 초과 → 1)
 * - isCorporation === true 시: excludedHouses=0, ownershipRatio=1, isSingleHouseEligible=false 강제
 *   (법인은 합산배제·공동명의·1세대1주택 공제 모두 불가)
 * - isSpouseJointSingleHouse === true 시: houses === 1 + 법인 아닐 때만 유효 (그 외 false 강제) — PDF 자격 "부부가 1주택만 공동소유"
 */

import type { PropertyTaxInput } from "./property-tax-types";

export function normalizeInput(input: PropertyTaxInput): PropertyTaxInput {
  const isCorp = input.isCorporation === true;

  const excludedRaw = input.excludedHouses ?? 0;
  const excludedHouses = isCorp
    ? 0
    : Math.max(0, Math.min(input.houses, Math.floor(excludedRaw)));

  const ratioRaw = input.ownershipRatio;
  let ownershipRatio: number;
  if (isCorp) {
    ownershipRatio = 1;
  } else if (ratioRaw === undefined || !Number.isFinite(ratioRaw) || ratioRaw <= 0 || ratioRaw > 1) {
    ownershipRatio = 1;
  } else {
    ownershipRatio = ratioRaw;
  }

  const isSingleHouseEligible = isCorp ? false : input.isSingleHouseEligible;

  // B-5 부부 공동명의 1주택자 특례: 자격 = houses === 1 + 법인 아님 (그 외 false 강제)
  const isSpouseJointSingleHouse =
    !isCorp && input.houses === 1 && input.isSpouseJointSingleHouse === true;

  // 세션 111: 법인 9종 일반 누진세율 특례 카테고리 — 법인 아니면 자동 undefined 강제 (양립 가드)
  const corporationGeneralRateCategory = isCorp ? input.corporationGeneralRateCategory : undefined;

  return {
    ...input,
    excludedHouses,
    ownershipRatio,
    isSingleHouseEligible,
    isCorporation: isCorp,
    isSpouseJointSingleHouse,
    corporationGeneralRateCategory,
  };
}
