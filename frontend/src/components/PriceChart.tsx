"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { getPriceHistory, getPriceStats } from "@/lib/api";
import type { PriceHistory, PriceStats, PriceStat } from "@/types";

interface PriceChartProps {
  complexNo: string;
}

function formatPrice(value: number): string {
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const rest = value % 10000;
    return rest > 0 ? `${eok}억${rest}` : `${eok}억`;
  }
  return `${value.toLocaleString()}만`;
}

function formatMonth(yyyymm: string): string {
  if (yyyymm.length === 6) {
    return `${yyyymm.slice(2, 4)}.${yyyymm.slice(4)}`;
  }
  return yyyymm;
}

export default function PriceChart({ complexNo }: PriceChartProps) {
  const [tradeType, setTradeType] = useState<"A1" | "B1">("A1");
  const [priceHistory, setPriceHistory] = useState<PriceHistory | null>(null);
  const [priceStats, setPriceStats] = useState<PriceStats | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setHistoryError(false);
    getPriceHistory(complexNo, tradeType)
      .then(setPriceHistory)
      .catch(() => {
        setPriceHistory(null);
        setHistoryError(true);
      })
      .finally(() => setLoading(false));
  }, [complexNo, tradeType]);

  useEffect(() => {
    setStatsError(false);
    getPriceStats(complexNo)
      .then(setPriceStats)
      .catch(() => {
        setPriceStats(null);
        setStatsError(true);
      });
  }, [complexNo]);

  const chartData = useMemo(
    () =>
      priceHistory?.history.map((h) => ({
        month: formatMonth(h.base_month),
        상한가: h.price_upper,
        하한가: h.price_lower,
        평균가: h.price_avg,
      })) ?? [],
    [priceHistory]
  );

  return (
    <div className="space-y-6">
      {/* 시세 추이 차트 */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">시세 추이</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTradeType("A1")}
              className={`px-3 py-1 text-sm rounded ${
                tradeType === "A1"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              매매
            </button>
            <button
              onClick={() => setTradeType("B1")}
              className={`px-3 py-1 text-sm rounded ${
                tradeType === "B1"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              전세
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-500">
            로딩 중...
          </div>
        ) : historyError ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2">
            <span className="text-red-400 text-sm">시세 데이터를 불러오지 못했습니다</span>
            <button
              onClick={() => {
                setLoading(true);
                setHistoryError(false);
                getPriceHistory(complexNo, tradeType)
                  .then(setPriceHistory)
                  .catch(() => { setPriceHistory(null); setHistoryError(true); })
                  .finally(() => setLoading(false));
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500">
            시세 데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis
                tickFormatter={(v) => formatPrice(v)}
                fontSize={12}
                width={70}
              />
              <Tooltip
                formatter={(value) => formatPrice(Number(value))}
                labelFormatter={(label) => `20${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="상한가"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="평균가"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="하한가"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 가격 통계 — 면적별 */}
      {statsError && (
        <div className="bg-white rounded-lg border p-4 text-center text-red-400 text-sm">
          가격 통계를 불러오지 못했습니다
        </div>
      )}
      {!statsError && priceStats && priceStats.by_area.length === 0 && priceStats.by_floor.length === 0 && (
        <div className="bg-white rounded-lg border p-4 text-center text-gray-500 text-sm">
          매매 매물 가격 통계 데이터가 부족합니다
        </div>
      )}
      {priceStats && priceStats.by_area.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold text-lg mb-4">면적별 가격 분포</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={priceStats.by_area}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis
                tickFormatter={(v) => formatPrice(v)}
                fontSize={12}
                width={70}
              />
              <Tooltip formatter={(value) => formatPrice(Number(value))} />
              <Legend />
              <Bar dataKey="min" name="최저" fill="#22c55e" />
              <Bar dataKey="median" name="중앙값" fill="#3b82f6" />
              <Bar dataKey="max" name="최고" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 가격 통계 — 층수별 */}
      {priceStats && priceStats.by_floor.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold text-lg mb-4">층수별 가격 분포</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {priceStats.by_floor.map((stat) => (
              <div key={stat.label} className="border rounded-lg p-3">
                <div className="text-sm font-medium text-gray-600 mb-2">
                  {stat.label}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">중앙값</span>
                    <span className="font-medium">{formatPrice(stat.median)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">평균</span>
                    <span>{formatPrice(stat.avg)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">범위</span>
                    <span>
                      {formatPrice(stat.min)} ~ {formatPrice(stat.max)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">매물 수</span>
                    <span>{stat.count}건</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
