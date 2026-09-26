"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminNaverCalls, type NaverCallStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "./AdminCard";
import RawDetail from "./RawDetail";

interface Props {
  getToken: () => Promise<string>;
  /** true 면 카드 제목을 숨긴다 — 대시보드 접힌 절 안에서 절 제목과 두 줄로 겹치지 않게 (AdminCard.hideTitle) */
  hideTitle?: boolean;
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
  article_detail_live_fallback: { name: "매물 상세 (대체 경로)", group: "user" },
  article_detail_realtime: { name: "매물 상세 (재시도)", group: "user" },
  complex_prices_ondemand: { name: "시세 (요청 시)", group: "user" },
  complex_real_prices_ondemand: { name: "실거래가 (요청 시)", group: "user" },
  complex_detail: { name: "단지 보강", group: "user" },
  search_discover: { name: "단지 발견", group: "scheduler" },
  crawl_articles_batch: { name: "매물 목록 (자동)", group: "scheduler" },
  article_detail_batch: { name: "매물 상세 (자동)", group: "scheduler" },
  complex_prices_batch: { name: "시세 (자동)", group: "scheduler" },
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
  scheduler: "자동",
  other: "기타",
};

const GROUP_CLASS: Record<Row["group"], string> = {
  user: "bg-blue-50 text-blue-700 border-blue-200",
  scheduler: "bg-purple-50 text-purple-700 border-purple-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}일 ${rh}시간`;
  }
  return `${h}시간 ${m}분`;
}

/**
 * 네이버 API 호출 계측 대시보드 카드.
 * 세션 50 `/api/admin/naver-calls` 를 60초 간격으로 폴링.
 * 시도 수 기준 (캐시 히트 포함). 실제 HTTP 수는 naver_api.py 내부 로깅과 교차 검증 필요.
 */
export default function NaverCallsCard({ getToken, hideTitle = false }: Props) {
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
  const uptime = data?.process_uptime_seconds;
  const uptimeUnder24h = uptime != null && uptime < 86400;

  return (
    <AdminCard hideTitle={hideTitle}
      title="네이버 호출 횟수 (10분 / 1시간 / 24시간)"
      help="우리 서버가 네이버에 요청을 몇 번 보냈는지 시간 단위로 보여줘요. 너무 자주 부르면 네이버가 우리를 차단하기 때문에 시간당 800회 안 넘기는 게 안전해요. 서버를 켠 지 24시간이 안 됐으면 24시간 숫자는 정확하지 않아요"
      action={
        uptime != null ? (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              uptimeUnder24h
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "bg-green-50 text-green-700 border-green-300"
            }`}
            title="서버를 다시 켜면 0부터 다시 셉니다"
          >
            켜진 지 {formatUptime(uptime)}
          </span>
        ) : undefined
      }
    >
      {isLoading && !data && (
        <div className="h-30 bg-gray-100 animate-pulse rounded" />
      )}

      {error && (
        <p className="text-xs text-red-700">
          호출 통계를 불러오지 못했어요.
        </p>
      )}

      {data && (
        <>
          <div className="overflow-x-auto">
            {/* 5열 — 휴대폰에서 칸이 눌리지 않게 최소 폭을 두고 가로로 넘긴다 */}
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-1.5 font-medium">누가</th>
                  <th className="text-left py-1.5 font-medium">작업</th>
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
                    {/* 코드 원문(label)은 본문에 두지 않는다 — 마우스를 올리거나 이름을 누르면 보인다 */}
                    <td className="py-1.5 text-gray-700" title={r.label}>
                      <RawDetail raw={r.label}>
                        <span>{r.name}</span>
                      </RawDetail>
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
            실제로 네이버에 보낸 요청과, 저장돼 있던 걸 다시 쓴 것까지 모두 합한 숫자예요. 60초마다 저절로 새로 고쳐져요.
          </p>
        </>
      )}
    </AdminCard>
  );
}
