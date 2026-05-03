/**
 * 양도소득세 계산 진입점 (소득세법 §95② + §104, 2026 기준).
 * 6분기 분기 → branch 함수는 transfer-tax-branches.ts 에 분리.
 * UI는 만원→원 변환 후 호출. 모든 금액은 원(KRW) 단위.
 */

import { type TransferInput, type TransferResult, type TransferNoticeKey, EMPTY_RESULT } from "./transfer-tax-types";
import {
  SHORT_TERM_UNDER_1Y, SHORT_TERM_1Y_TO_2Y,
  HEAVY_RATE_2_HOUSES, HEAVY_RATE_3_HOUSES,
  EXEMPTION_END_DATE, HIGH_VALUE_THRESHOLD, MAX_AMOUNT_WON,
} from "./transfer-brackets";
import {
  lossBranch, unregisteredBranch, singleHouseExemptBranch,
  singleHouseProrateBranch, generalBranch,
} from "./transfer-tax-branches";

export type { TransferInput, TransferResult, TransferNoticeKey } from "./transfer-tax-types";
export { EMPTY_RESULT } from "./transfer-tax-types";
export { EXEMPTION_END_DATE, FOUR_DISTRICT_GRACE_DATE } from "./transfer-brackets";

const validateAmount = (won: number) =>
  won >= 0 && Number.isFinite(won) && won <= MAX_AMOUNT_WON;

function computeShortTermRate(holdYears: number): number {
  if (holdYears < 1) return SHORT_TERM_UNDER_1Y;
  if (holdYears < 2) return SHORT_TERM_1Y_TO_2Y;
  return 0;
}

function originalHeavyRate(houses: 1 | 2 | 3): number {
  if (houses === 2) return HEAVY_RATE_2_HOUSES;
  if (houses === 3) return HEAVY_RATE_3_HOUSES;
  return 0;
}

// 한시배제: 양도일 ≤ 2026-05-09 + 보유 2년+ + 조정 다주택 → 중과 0 (장특공은 branch 함수에서).
function computeHeavyRate(input: TransferInput): number {
  if (input.exemptionOverride === "force-exclude") return 0;
  if (input.houses === 1) return 0;
  if (!input.isRegulatedAtTransfer) return 0;
  if (input.exemptionOverride === "force-apply") return originalHeavyRate(input.houses);
  if (input.holdYears < 2) return originalHeavyRate(input.houses);
  if (input.transferDate <= EXEMPTION_END_DATE) return 0;
  return originalHeavyRate(input.houses);
}

// 정밀도: day-precision (양도일 ISO YYYY-MM-DD 사전순 = 시간순).
export function computeHoldYears(acquisitionDate: string, transferDate: string): number {
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;
  const acq = new Date(acquisitionDate + "T00:00:00+09:00").getTime();
  const trf = new Date(transferDate + "T00:00:00+09:00").getTime();
  if (!Number.isFinite(acq) || !Number.isFinite(trf)) return 0;
  return Math.max(0, (trf - acq) / MS_PER_YEAR);
}

export function calculateTransferTax(input: TransferInput): TransferResult {
  if (!validateAmount(input.transferWon)) return EMPTY_RESULT;
  if (!validateAmount(input.acquisitionWon)) return EMPTY_RESULT;
  if (input.transferWon === 0 || input.acquisitionWon === 0) return EMPTY_RESULT;

  const gain = input.transferWon - input.acquisitionWon - input.expensesWon;

  // GATE 0.5: 미등기 최우선 (loss·다주택보다 위).
  if (input.isUnregistered) return unregisteredBranch(Math.max(0, gain));

  // GATE 1: 양도차손.
  if (gain <= 0) return lossBranch();

  // GATE 2: 1세대1주택 비과세 라인.
  if (input.houses === 1 && input.holdYears >= 2) {
    const livingOK = !input.isRegulatedAtAcquisition || input.livedYears >= 2;
    if (livingOK) {
      if (input.transferWon <= HIGH_VALUE_THRESHOLD) return singleHouseExemptBranch(gain);
      if (input.holdYears >= 3 && input.livedYears >= 2) {
        return singleHouseProrateBranch(input, gain);
      }
    }
  }

  // GATE 3: 일반 (단기 + 중과 + 장특공 표1 + 누진).
  const shortRate = computeShortTermRate(input.holdYears);
  const heavyAddRate = computeHeavyRate(input);
  const result = generalBranch(input, gain, shortRate, heavyAddRate);

  // R14: 1주택 비과세 폴백 사유 notes 활성화 (dead code 제거).
  if (input.houses === 1) {
    let failNote: TransferNoticeKey | null = null;
    if (input.holdYears < 2) failNote = "single-house-fail-hold";
    else if (input.isRegulatedAtAcquisition && input.livedYears < 2) failNote = "single-house-fail-live";
    if (failNote) return { ...result, notes: [...result.notes, failNote] };
  }
  return result;
}
