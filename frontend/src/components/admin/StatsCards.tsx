"use client";

import { formatPct } from "@/lib/format";
import type { DetailedStats } from "@/types/admin";

/** 상세 통계 숫자의 성질 — 서버 보관 시간(5분)과 같게 */
export const STATS_REFRESH_NOTE = "숫자는 5분마다 새로 계산해요";

interface Props {
  stats: DetailedStats | null;
  loading: boolean;
  /** true = 대시보드용 4칸만(단지 수·활성 매물·사용자·오늘 수집). 24시간 오류·채워진 비율은
   *  /admin/data 에서 본다 — 한 화면에 같은 숫자를 두 번 두지 않으려는 것. */
  compact?: boolean;
}

export default function StatsCards({ stats, loading, compact = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white border rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: "단지 수", value: (stats.complex_count ?? 0).toLocaleString(), color: "text-blue-600" },
    { label: "활성 매물", value: (stats.active_article_count ?? 0).toLocaleString(), color: "text-green-600" },
    { label: "사용자", value: (stats.user_count ?? 0).toLocaleString(), color: "text-purple-600" },
    { label: "오늘 수집", value: (stats.today_crawl_count ?? 0).toLocaleString(), color: "text-orange-600" },
  ];

  return (
    <div>
      {/* 서버가 상세 통계를 5분 보관한다(backend/routers/admin/jobs.py _STATS_CACHE_TTL_SEC = 300).
          그 값을 바꾸면 이 문구의 분 수도 함께 바꾼다 */}
      <p className="text-xs text-gray-400 mb-2">{STATS_REFRESH_NOTE}</p>
      <div data-testid="stats-cards" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
        {!compact && (stats.error_count_24h ?? 0) > 0 && (
          <div className="col-span-full bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            최근 24시간 오류: {stats.error_count_24h}건
          </div>
        )}
        {!compact && (
          <div className="col-span-full bg-accent-blue/10 border border-accent-blue/30 rounded-lg p-3 text-sm">
            <p className="font-semibold mb-1">채워진 비율</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>단지 상세: {formatPct(stats.complex_detail_fill_rate)}</div>
              <div>매물 상세: {formatPct(stats.article_detail_fill_rate)}</div>
              <div>가치 점수: {formatPct(stats.complex_metric_fill_rate)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
