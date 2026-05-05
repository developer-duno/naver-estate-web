/**
 * 보유세 입력 정규화 (clamp + corp 강제).
 * 9 GATE 5 정정으로 신설 — UI 우회·URL 조작·극단값 방어 단일 책임.
 * - excludedHouses: 0 ≤ x ≤ houses 로 clamp (음수 → 0, houses 초과 → houses)
 * - ownershipRatio: 0 < x ≤ 1 로 clamp (0/음수 → 1, Infinity/NaN → 1, 1 초과 → 1)
 * - isCorporation === true 시: excludedHouses=0, ownershipRatio=1, isSingleHouseEligible=false 강제
 *   (법인은 합산배제·공동명의·1세대1주택 공제 모두 불가)
 * - isSpouseJointSingleHouse === true 시: houses === 1 + 법인 아닐 때만 유효 (그 외 false 강제) — PDF 자격 "부부가 1주택만 공동소유"
 * - specialHouses (세션 112, PDF #12): houses === 1 + isSingleHouseEligible + 비법인 시만 활성. 그 외 undefined 강제.
 *   카테고리별 count 0~3 clamp / publishedTotal ≥0 clamp / count===0 시 publishedTotal 도 0 강제 (양립 모순 차단)
 */

import type { PropertyTaxInput, SpecialHousesInput, SpecialHouseEntry } from "./property-tax-types";

/** 5종 특례주택 카테고리 키 (반복 처리용) */
const SPECIAL_HOUSE_KEYS = ["temporary2", "inherited", "ruralLowPrice", "populationDecline", "postCompletionUnsold"] as const;

/** 카테고리 1개 정규화: count 0~3 clamp + publishedTotal ≥0 clamp + count=0 시 publishedTotal=0 강제 */
function normalizeSpecialHouseEntry(raw: SpecialHouseEntry | undefined): SpecialHouseEntry | undefined {
  if (!raw) return undefined;
  const countRaw = raw.count;
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(3, Math.floor(countRaw)) : 0;
  const publishedRaw = raw.publishedTotal;
  const publishedTotal = count === 0 ? 0 : (Number.isFinite(publishedRaw) && publishedRaw > 0 ? publishedRaw : 0);
  if (count === 0 && publishedTotal === 0) return undefined; // 빈 entry 는 undefined 로 정리
  return { count, publishedTotal };
}

/** 5종 특례주택 전체 정규화 (자격 미충족 시 undefined 강제) */
function normalizeSpecialHouses(input: PropertyTaxInput, isCorp: boolean, isSingleHouseEligible: boolean): SpecialHousesInput | undefined {
  // 자격 미충족 (법인·다주택·1세대1주택 자격 무) 시 전체 undefined
  if (isCorp || input.houses !== 1 || !isSingleHouseEligible) return undefined;
  const raw = input.specialHouses;
  if (!raw) return undefined;
  const normalized: SpecialHousesInput = {};
  let hasAny = false;
  for (const key of SPECIAL_HOUSE_KEYS) {
    const entry = normalizeSpecialHouseEntry(raw[key]);
    if (entry) {
      normalized[key] = entry;
      hasAny = true;
    }
  }
  return hasAny ? normalized : undefined;
}

export function normalizeInput(input: PropertyTaxInput): PropertyTaxInput {
  const isCorp = input.isCorporation === true;
  // 세션 111: 법인 9종 일반 누진세율 특례 카테고리 — 법인 아니면 자동 undefined 강제 (양립 가드)
  const corporationGeneralRateCategory = isCorp ? input.corporationGeneralRateCategory : undefined;
  const isCorpGeneral = isCorp && corporationGeneralRateCategory != null;

  // 합산배제: 단일세율 법인은 0 강제 / 일반 누진세율 신청 법인 + 개인은 입력 허용
  // (PDF #14 합산배제 신고기간 9.16~9.30 동일, 양립 가능)
  const excludedRaw = input.excludedHouses ?? 0;
  const excludedHouses = (isCorp && !isCorpGeneral)
    ? 0
    : Math.max(0, Math.min(input.houses, Math.floor(excludedRaw)));

  const ratioRaw = input.ownershipRatio;
  let ownershipRatio: number;
  if (isCorp) {
    // 법인은 단일세율·일반세율 무관 공동명의 개념 없음 (1 강제)
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

  // 세션 112: 5종 특례주택 (PDF #12) — 법인·다주택·자격 미충족 시 undefined 강제
  const specialHouses = normalizeSpecialHouses(input, isCorp, isSingleHouseEligible);

  return {
    ...input,
    excludedHouses,
    ownershipRatio,
    isSingleHouseEligible,
    isCorporation: isCorp,
    isSpouseJointSingleHouse,
    corporationGeneralRateCategory,
    specialHouses,
  };
}
