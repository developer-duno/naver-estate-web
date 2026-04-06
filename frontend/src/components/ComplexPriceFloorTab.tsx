"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { PriceStats, ArticleFilters } from "@/types";
import { formatChartPrice } from "@/lib/format";

const LazyCharts = dynamic(() => import("./PriceChartInner"), { ssr: false });

/** 층수별 가격 탭 — 카드형 UI + 클릭 시 해당 층수 필터 적용 */
export default function ComplexPriceFloorTab({ priceStats, error, loading, onFilterChange }: {
  priceStats: PriceStats | null;
  error: boolean;
  loading: boolean;
  onFilterChange?: (filters: ArticleFilters) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  if (loading) return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>;
  if (error) return <p className="text-red-500 text-sm text-center">가격 통계를 불러오지 못했습니다</p>;
  if (!priceStats || priceStats.by_floor.length === 0)
    return <p className="text-gray-500 text-sm text-center">층수별 가격 데이터가 부족합니다</p>;

  const handleFloorClick = (label: string) => {
    if (!onFilterChange) return;
    if (selectedLabel === label) {
      setSelectedLabel(null);
      onFilterChange({ min_floor: undefined, max_floor: undefined });
      return;
    }
    setSelectedLabel(label);
    const numMatch = label.match(/(\d+)[^0-9]+(\d+)?/);
    if (!numMatch) return;
    const min = parseInt(numMatch[1], 10);
    const max = numMatch[2] ? parseInt(numMatch[2], 10) : undefined;
    onFilterChange({ min_floor: min, max_floor: max });
  };

  const TRADE_TYPES = [
    { key: "매매", avgKey: "maemae_avg", minKey: "maemae_min", maxKey: "maemae_max", countKey: "maemae_count", color: "text-red-600" },
    { key: "전세", avgKey: "jeonse_avg", minKey: "jeonse_min", maxKey: "jeonse_max", countKey: "jeonse_count", color: "text-blue-600" },
    { key: "월세", avgKey: "wolse_avg",  minKey: "wolse_min",  maxKey: "wolse_max",  countKey: "wolse_count",  color: "text-green-600" },
  ] as const;

  return (
    <div>
      {onFilterChange && (
        <p className="text-xs text-gray-400 mb-2 text-right">카드를 클릭하면 해당 층수 매물만 표시됩니다</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {priceStats.by_floor.map((s) => {
        return (
          <div
              key={s.label}
              onClick={() => handleFloorClick(s.label)}
              className={[
                "border rounded-lg p-3 transition-colors",
                onFilterChange ? "cursor-pointer hover:border-blue-400" : "",
                selectedLabel === s.label ? "border-blue-500 bg-blue-50" : "",
              ].join(" ")}
            >
            <div className="text-sm font-semibold text-gray-700 mb-3">{s.label}</div>
            <div className="space-y-2">
              {TRADE_TYPES.map(({ key, avgKey, minKey, maxKey, countKey, color }) => {
                const avg = s[avgKey];
                if (avg == null) return null;
                return (
                  <div key={key} className="text-xs">
                    <div className={"font-medium mb-0.5 " + color}>{key}</div>
                    <div className="grid grid-cols-2 gap-x-2 text-gray-600">
                      <span>평균</span><span className="font-medium">{formatChartPrice(avg)}</span>
                      <span>최저</span><span>{formatChartPrice(s[minKey] ?? 0)}</span>
                      <span>최고</span><span>{formatChartPrice(s[maxKey] ?? 0)}</span>
                      <span>매물수</span><span>{s[countKey]}건</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
