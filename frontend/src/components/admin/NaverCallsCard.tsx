"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminNaverCalls, type NaverCallStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "./AdminCard";

interface Props {
  getToken: () => Promise<string>;
}

/**
 * 라벨 → 사람이 읽을 한글 이름 + 경로 분류.
 * 세션 50 에 record_call 훅이 박힌 13개 라벨.
 * 나타나지 않은 라벨은 "기타" 로 몰아서 최소한 표시.
 */
const LABEL_META: Record<string, { name: string; group: "user" | "scheduler" }> = {
  search: { name: "검색", group: "user" },
  crawl_articles_live: { name: "매물 목록 (실시간)", group: "user" },
  article_detail_live: { name: "매물 상세 (실시간)", group: "user" },
  article_detail_live_fallback: { name: "매물 상세 폴백", group: "user" },
  article_detail_realtime: { name: "매물 상세 (재시도)", group: "user" },
  complex_prices_ondemand: { name: "시세 (on-demand)", group: "user" },
  complex_real_prices_ondemand: { name: "실거래가 (on-demand)", group: "user" },
  complex_detail: { name: "단지 보강", group: "user" },
  search_discover: { name: "단지 발견", group: "scheduler" },
  crawl_articles_batch: { name: "매물 목록 (배치)", group: "scheduler" },
  article_detail_batch: { name: "매물 상세 (배치)", group: "scheduler" },
  complex_prices_batch: { name: "시세 (배치)", group: "scheduler" },
};

interface Row {
  label: string;
  name: string;
  group: "user" | "scheduler" | "other";
  counts: { "10m": number; "1h": number; "24h": number };
}

function buildRows(stats: NaverCallStats): Row[] {
  const rows: Row[] = Object.entries(stats.labels).map(([label, counts]) => {
    const meta = LABEL_META[label];
    return {
      label,
      name: meta?.name ?? label,
      group: meta?.group ?? "other",
      counts,
    };
  });
  // 24h 내림차순 → 1h → 10m
  rows.sort((a, b) => {
    if (b.counts["24h"] !== a.counts["24h"]) return b.counts["24h"] - a.counts["24h"];
    if (b.counts["1h"] !== a.counts["1h"]) return b.counts["1h"] - a.counts["1h"];
    return b.counts["10m"] - a.counts["10m"];
  });
  return rows;
}

const GROUP_LABEL: Record<Row["group"], string> = {
  user: "사용자",
  scheduler: "스케줄러",
  other: "기타",
};

const GROUP_CLASS: Record<Row["group"], string> = {
  user: "bg-blue-50 text-blue-700 border-blue-200",
  scheduler: "bg-purple-50 text-purple-700 border-purple-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

/**
 * 네이버 API 호출 계측 대시보드 카드.
 * 세션 50 `/api/admin/naver-calls` 를 60초 간격으로 폴링.
 * 시도 수 기준 (캐시 히트 포함). 실제 HTTP 수는 naver_api.py 내부 로깅과 교차 검증 필요.
 */
export default function NaverCallsCard({ getToken }: Props) {
  const { data, isLoading, error } = useQuery<NaverCallStats, Error>({
    queryKey: queryKeys.admin.naverCalls(),
    queryFn: async () => {
      const token = await getToken();
      return getAdminNaverCalls(token);
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const rows = data ? buildRows(data) : [];
  const totals = data?.totals ?? { "10m": 0, "1h": 0, "24h": 0 };

  return (
    <AdminCard title="네이버 API 호출 계측">
      {isLoading && !data && (
        <div className="h-[120px] bg-gray-100 animate-pulse rounded" />
      )}

      {error && (
        <p className="text-xs text-red-700">
          호출 통계를 불러오지 못했습니다: {error.message}
        </p>
      )}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-1.5 font-medium">경로</th>
                  <th className="text-left py-1.5 font-medium">라벨</th>
                  <th className="text-right py-1.5 font-medium">10분</th>
                  <th className="text-right py-1.5 font-medium">1시간</th>
                  <th className="text-right py-1.5 font-medium">24시간</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-gray-500">
                      아직 집계된 호출이 없습니다
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5">
                      <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${GROUP_CLASS[r.group]}`}>
                        {GROUP_LABEL[r.group]}
                      </span>
                    </td>
                    <td className="py-1.5 text-gray-700">
                      {r.name}
                      {r.name !== r.label && (
                        <span className="ml-1 text-[10px] text-gray-400">({r.label})</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{r.counts["10m"].toLocaleString("ko")}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.counts["1h"].toLocaleString("ko")}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.counts["24h"].toLocaleString("ko")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-medium border-t-2 border-gray-300">
                  <td colSpan={2} className="py-1.5 text-gray-700">합계</td>
                  <td className="py-1.5 text-right tabular-nums">{totals["10m"].toLocaleString("ko")}</td>
                  <td className="py-1.5 text-right tabular-nums">{totals["1h"].toLocaleString("ko")}</td>
                  <td className="py-1.5 text-right tabular-nums">{totals["24h"].toLocaleString("ko")}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            시도 수 기준 (캐시 히트 포함). 60초마다 자동 갱신.
          </p>
        </>
      )}
    </AdminCard>
  );
}
