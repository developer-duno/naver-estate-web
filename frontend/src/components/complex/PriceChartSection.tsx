"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPriceHistory } from "@/lib/api";
import { usePriceCollect } from "@/hooks/usePriceCollect";
import { Button } from "@/components/ui/button";
import Skeleton from "@/components/Skeleton";
import LockedDataCard, { isAuthGateError, lockReasonOf } from "@/components/ui/locked-data-card";
import type { PyeongDetail } from "@/types";

const LazyPriceHistory = dynamic(() => import("@/components/PriceHistoryChart"), { ssr: false });

interface Props {
  complexNo: string;
  pyeongDetails: PyeongDetail[];
  accessToken?: string;
  /** 대표 전용면적 묶음(세션 474 B27) — 평형을 안 고르면 그래프가 이 면적 값만 그린다 */
  repAreaM2?: number | null;
  /** 비로그인 확정 — 추이 요청 없이 잠금 카드(세션 481 보완 F4) */
  loggedOut?: boolean;
  /** 승인 중개사 — 자동 실거래가 수집(네이버 호출)은 이때만(세션 481 보완 F6) */
  canAct?: boolean;
}

/** 실거래가 추이 섹션 — 면적 선택 + 수집 버튼 + 차트 (페이지 진입 시 자동 수집 1회). */
export default function PriceChartSection({ complexNo, pyeongDetails, accessToken, repAreaM2, loggedOut = false, canAct = false }: Props) {
  const queryClient = useQueryClient();
  const [historyAreaNo, setHistoryAreaNo] = useState<string>("");
  const { collecting, message: collectMessage, messageType: collectMessageType, startCollect, clearPolling } = usePriceCollect();

  const priceHistoryQuery = useQuery({
    queryKey: queryKeys.priceHistory(complexNo, undefined, historyAreaNo || undefined),
    queryFn: () => getPriceHistory(complexNo, undefined, historyAreaNo || undefined, accessToken),
    enabled: !!complexNo && !loggedOut,
  });

  useEffect(() => clearPolling, [clearPolling]);

  // 페이지 진입 시 1회 자동 수집 (24h TTL — 서버 fresh 판단, AdaptiveThrottle 보호)
  // 승인 중개사만 — 미승인 로그인 회원은 BE 가 403 이라 자동 호출하지 않는다(세션 481 보완 F6)
  const autoCollectRef = useRef<string>("");
  useEffect(() => {
    if (!accessToken || !canAct || collecting) return;
    if (autoCollectRef.current === complexNo) return;
    autoCollectRef.current = complexNo;
    startCollect(complexNo, accessToken, () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(complexNo) });
    });
  }, [complexNo, accessToken, canAct, collecting, startCollect, queryClient]);

  const historyItems = priceHistoryQuery.data?.items ?? [];
  // 그래프가 그린 면적과 기준 글자(BE 정본 — 범위 그래프용 basis_range, 세션 479 B29 · 옛 basis 는 중위 선 시절 글자라 안 읽는다).
  // 면적을 모르면(대표 면적 미계산) 옛 그대로 아무것도 안 붙인다.
  const historyArea = priceHistoryQuery.data?.area_m2 ?? null;
  const historyBasis = priceHistoryQuery.data?.basis_range ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {pyeongDetails.length > 0 && (
          <select
            value={historyAreaNo}
            onChange={(e) => setHistoryAreaNo(e.target.value)}
            className="text-sm border rounded px-2 py-1.5 text-gray-700"
            aria-label="실거래가 면적 선택"
          >
            <option value="">{repAreaM2 != null ? `대표 면적(전용 ${repAreaM2}㎡ 대)` : "전체 면적"}</option>
            {pyeongDetails.map((pd) => (
              <option key={pd.pyeong_no} value={String(pd.pyeong_no)}>
                {pd.pyeong_name ? `${pd.pyeong_name} (${pd.exclusive_area}㎡)` : `${pd.exclusive_area}㎡`}
              </option>
            ))}
          </select>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={collecting || !accessToken}
          onClick={() => {
            if (!accessToken) return;
            startCollect(complexNo, accessToken, () => {
              queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(complexNo) });
            });
          }}
          className="no-print"
        >
          {collecting ? "수집 중..." : "실거래가 수집"}
        </Button>
        {!accessToken && (
          <span className="text-xs text-gray-400">로그인하고 공인중개사 인증을 받으면 수집할 수 있어요</span>
        )}
        {collectMessage && (
          <span className={`text-xs ${
            collectMessageType === "error" ? "text-red-500" :
            collectMessageType === "info" ? "text-blue-600" :
            "text-green-600"
          }`}>
            {collectMessage}
          </span>
        )}
      </div>
      {loggedOut ? (
        <LockedDataCard label="실거래가" />
      ) : priceHistoryQuery.isLoading ? (
        <div role="status" aria-label="로딩 중">
          <span className="sr-only">실거래가 추이 로딩 중...</span>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : priceHistoryQuery.isError ? (
        isAuthGateError(priceHistoryQuery.error) ? (
          <LockedDataCard label="실거래가" reason={lockReasonOf(priceHistoryQuery.error)} />
        ) : (
          <div className="text-center py-4">
            <p className="text-red-500 text-sm">가격 추이를 불러오지 못했습니다</p>
            <button
              type="button"
              onClick={() => priceHistoryQuery.refetch()}
              className="text-xs text-blue-600 hover:underline mt-2"
            >
              다시 시도
            </button>
          </div>
        )
      ) : (
        <>
          {historyBasis && (
            <p className="text-sm font-medium text-gray-700" data-testid="price-history-basis">
              실거래가 추이 · {historyBasis}
            </p>
          )}
          <LazyPriceHistory items={historyItems} areaLabel={historyArea != null ? `전용 ${historyArea}㎡ 대` : undefined} />
        </>
      )}
    </div>
  );
}
