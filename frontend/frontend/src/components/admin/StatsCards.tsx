"use client";

import type { DetailedStats } from "@/types/admin";

interface Props {
  stats: DetailedStats | null;
  loading: boolean;
}

export default function StatsCards({ stats, loading }: Props) {
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
    { label: "단지 수", value: stats.complex_count.toLocaleString(), color: "text-blue-600" },
    { label: "활성 매물", value: stats.active_article_count.toLocaleString(), color: "text-green-600" },
    { label: "사용자", value: stats.user_count.toLocaleString(), color: "text-purple-600" },
    { label: "오늘 크롤", value: stats.today_crawl_count.toLocaleString(), color: "text-orange-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">{card.label}</p>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
      {stats.error_count_24h > 0 && (
        <div className="col-span-full bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          최근 24시간 에러: {stats.error_count_24h}건
        </div>
      )}
    </div>
  );
}
