/**
 * 단지 비교 유틸 — 순수 함수, 테스트 가능
 * 세션 472 PR 3: 단지 간 우위(★) 판정(ADVANTAGE_ROWS·getBestIndices·getAdvantageForRow)을 지웠다.
 * 비교 화면은 값만 나란히 보여 주고 출처는 페이지 맨 아래 각주에 둔다.
 */
import type { PriceStats } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";

/** PriceStats의 by_area에서 가중 평균 평당가 계산 (만원/평) */
export function calcAvgPricePerPyeong(stats: PriceStats): number | null {
  let sumPrice = 0;
  let sumCount = 0;
  for (const a of stats.by_area) {
    if (a.maemae != null && a.maemae_count && a.maemae_count > 0) {
      const m2 = parseFloat(a.label); // "85m²" → 85
      if (isNaN(m2) || m2 <= 0) continue;
      const pyeong = m2 / M2_TO_PYEONG;
      sumPrice += (a.maemae / pyeong) * a.maemae_count;
      sumCount += a.maemae_count;
    }
  }
  return sumCount > 0 ? Math.round(sumPrice / sumCount) : null;
}
