"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { getPriceStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  getFavoritePriceSnapshot,
  saveFavoritePriceSnapshot,
  type FavoritePriceSnapshot,
} from "@/lib/storage";
import type { PriceStats, AreaPriceStat } from "@/types";

/**
 * 즐겨찾기 단지 가격 변동 배지 — 최소버전(FEATURE_BACKLOG_2026-08.md 항목2 3단계).
 *
 * getPriceStats 는 승인 중개사 전용(B2 게이트, routers/complexes.py get_price_stats)이라
 * tokenReady 가드 없이 호출하면 비승인 사용자에게 401/403 이 뜬다 — compare/page.tsx 의
 * enabled: tokenReady 패턴을 그대로 따른다. 비승인 사용자는 이 훅이 아무 요청도 안 보내고
 * changedIds 가 항상 빈 Set 이라 기존 화면과 동일하게 보인다.
 */

/** 단지의 대표가 — 첫 면적의 매매가, 없으면 전세가. 아예 없으면 null(가격 정보 없음). */
function representativePrice(stats: PriceStats | undefined): number | null {
  const first: AreaPriceStat | undefined = stats?.by_area?.[0];
  if (!first) return null;
  return first.maemae ?? first.jeonse ?? null;
}

export function useFavoritePriceChanges(
  complexNos: string[],
  sessionToken: string | undefined,
  tokenReady: boolean,
): { changedIds: Set<string> } {
  const queries = useQueries({
    queries: complexNos.map((no) => ({
      queryKey: queryKeys.priceStats(no),
      queryFn: () => getPriceStats(no, sessionToken),
      enabled: tokenReady && !!no,
      staleTime: 60_000,
    })),
  });

  // React Query 는 데이터 미변경 시 동일 참조 반환 → 안정적 키로 memo (compare/page.tsx 패턴 답습)
  const dataKey = queries.map((q) => `${q.data ? representativePrice(q.data) : "x"}`).join(",");
  const currentPrices = useMemo(() => {
    const m: Record<string, number | null> = {};
    complexNos.forEach((no, i) => {
      const q = queries[i];
      if (q?.data) m[no] = representativePrice(q.data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, complexNos.join(",")]);

  // 스냅샷 대조는 렌더 중이 아니라 조회 완료 시점에 1회 — StrictMode 이중 호출에도 안전.
  const snapshotRef = useRef<FavoritePriceSnapshot | null>(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = getFavoritePriceSnapshot();
  }

  const changedIds = useMemo(() => {
    const prev = snapshotRef.current ?? {};
    const changed = new Set<string>();
    for (const [no, price] of Object.entries(currentPrices)) {
      if (no in prev && prev[no] !== price) changed.add(no);
    }
    return changed;
  }, [currentPrices]);

  // 새 스냅샷 저장 — 다음 방문 때 비교 기준이 되도록. 값이 실제로 도착한 것만 갱신.
  useEffect(() => {
    if (Object.keys(currentPrices).length === 0) return;
    const prev = snapshotRef.current ?? {};
    const next = { ...prev, ...currentPrices };
    snapshotRef.current = next;
    saveFavoritePriceSnapshot(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return { changedIds };
}
