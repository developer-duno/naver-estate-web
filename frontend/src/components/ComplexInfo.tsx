"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { Complex, PyeongDetail, PriceStats, PriceHistoryItem, ArticleFilters } from "@/types";
import { formatDateFull, formatChartPrice } from "@/lib/format";
import { getPriceStats, getPriceHistory } from "@/lib/api";

const LazyCharts = dynamic(() => import("./PriceChartInner"), { ssr: false });
const LazyPriceHistory = dynamic(() => import("./PriceHistoryChart"), { ssr: false });

type TabType = "info" | "area" | "price-area" | "price-floor" | "price-history";

interface Props {
  complex: Complex;
  pyeongDetails: PyeongDetail[];
  complexNo: string;
  articleCount?: number;
  onFilterChange?: (filters: ArticleFilters) => void;
  /** 크롤 완료 시 부모가 증가시켜 가격 통계 re-fetch 트리거 */
  refreshKey?: number;
}

const TABS: { key: TabType; label: string }[] = [
  { key: "info", label: "단지정보" },
  { key: "area", label: "면적별 정보" },
  { key: "price-area", label: "면적별 가격" },
  { key: "price-floor", label: "층수별 가격" },
  { key: "price-history", label: "실거래가 추이" },
];

export default function ComplexInfo({ complex: cpx, pyeongDetails, complexNo, articleCount, onFilterChange, refreshKey }: Props) {
  const [tab, setTab] = useState<TabType>("info");
  const [priceStats, setPriceStats] = useState<PriceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [historyItems, setHistoryItems] = useState<PriceHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const historyFetchedRef = React.useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);
    getPriceStats(complexNo)
      .then((data) => { if (!cancelled) { setPriceStats(data); setStatsLoading(false); } })
      .catch(() => { if (!cancelled) { setPriceStats(null); setStatsError(true); setStatsLoading(false); } });
    // complexNo/refreshKey 변경 시 가격 추이도 초기화
    setHistoryItems([]);
    setHistoryError(false);
    historyFetchedRef.current = "";
    return () => { cancelled = true; };
  }, [complexNo, refreshKey]);

  useEffect(() => {
    if (tab !== "price-history") return;
    if (historyFetchedRef.current === complexNo) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(false);
    historyFetchedRef.current = complexNo;
    getPriceHistory(complexNo)
      .then((res) => { if (!cancelled) { setHistoryItems(res.items); setHistoryLoading(false); } })
      .catch(() => { if (!cancelled) { setHistoryError(true); setHistoryLoading(false); historyFetchedRef.current = ""; } });
    return () => { cancelled = true; };
  }, [tab, complexNo]);

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="flex border-b overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "info" && <BasicInfo cpx={cpx} />}
        {tab === "area" && <PyeongDetails details={pyeongDetails} />}
        {tab === "price-area" && (
          <PriceAreaTab priceStats={priceStats} error={statsError} loading={statsLoading} onFilterChange={onFilterChange} />
        )}
        {tab === "price-floor" && (
          <PriceFloorTab priceStats={priceStats} error={statsError} loading={statsLoading} onFilterChange={onFilterChange} />
        )}
        {tab === "price-history" && (
          historyLoading ? <p className="text-gray-500 text-sm">로딩 중...</p>
          : historyError ? <p className="text-red-500 text-sm">가격 추이를 불러오지 못했습니다</p>
          : <LazyPriceHistory items={historyItems} />
        )}
      </div>
    </div>
  );
}

function BasicInfo({ cpx }: { cpx: Complex }) {
  const rows: [string, string][] = [];
  const addr = cpx.address || cpx.cortar_address;
  if (addr) rows.push(["주소", addr]);
  if (cpx.road_address) rows.push(["도로명", cpx.road_address]);
  if (cpx.total_household_count != null) rows.push(["세대수", `${cpx.total_household_count.toLocaleString()}세대`]);
  if (cpx.high_floor != null) rows.push(["저/최고층", `${cpx.low_floor || 1}층 ~ ${cpx.high_floor}층`]);
  if (cpx.total_dong_count != null) rows.push(["동수", `${cpx.total_dong_count}개동`]);
  if (cpx.use_approve_ymd) {
    rows.push(["사용승인일", formatDateFull(cpx.use_approve_ymd)]);
  }
  if (cpx.construction_company) rows.push(["건설사", cpx.construction_company]);
  if (cpx.heat_method_type) rows.push(["난방", cpx.heat_method_type]);
  if (cpx.total_parking_count != null) {
    let s = `${cpx.total_parking_count.toLocaleString()}대`;
    if (cpx.parking_count_by_household != null) s += ` (세대당 ${cpx.parking_count_by_household}대)`;
    rows.push(["주차", s]);
  }
  if (cpx.floor_area_ratio) rows.push(["용적률", `${cpx.floor_area_ratio}%`]);
  if (cpx.building_coverage_ratio) rows.push(["건폐율", `${cpx.building_coverage_ratio}%`]);
  if (cpx.real_estate_type_name) rows.push(["유형", cpx.real_estate_type_name]);
  if (cpx.management_office_tel) rows.push(["관리사무소", cpx.management_office_tel]);

  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm">단지 상세 정보가 아직 수집되지 않았습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="text-sm text-gray-500 font-medium shrink-0 w-24">{label}</span>
          <span className="text-sm">{value}</span>
        </div>
      ))}
    </div>
  );
}

function PyeongDetails({ details }: { details: PyeongDetail[] }) {
  if (details.length === 0) {
    return <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {details.map((pd) => <PyeongCard key={pd.pyeong_no} detail={pd} />)}
    </div>
  );
}

function formatMaintCost(cost: number, basis?: string): string {
  const s = cost >= 10000
    ? `${cost.toLocaleString()}원 (약 ${Math.floor(cost / 10000)}만원)`
    : `${cost.toLocaleString()}원`;
  if (basis && basis.length === 6) return `${s} (${basis.slice(0, 4)}.${basis.slice(4)})`;
  return s;
}

function PyeongCard({ detail: pd }: { detail: PyeongDetail }) {
  const [showPlan, setShowPlan] = useState(false);
  const title = pd.pyeong_name && pd.exclusive_area
    ? `${pd.pyeong_name} (${pd.exclusive_area}㎡${pd.exclusive_pyeong ? `, ${pd.exclusive_pyeong}평` : ""})`
    : pd.exclusive_area ? `${pd.exclusive_area}㎡` : `면적 ${pd.pyeong_no}`;

  return (
    <div className="border rounded-lg p-3">
      <h4 className="text-sm font-semibold text-blue-700 mb-2">{title}</h4>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {pd.supply_area && pd.exclusive_area && (
          <>
            <span className="text-gray-500">공급/전용</span>
            <span>
              {pd.supply_area}㎡{pd.supply_pyeong ? `(${pd.supply_pyeong}평)` : ""}{" / "}
              {pd.exclusive_area}㎡{pd.exclusive_pyeong ? `(${pd.exclusive_pyeong}평)` : ""}
              {pd.exclusive_rate && ` 전용률 ${pd.exclusive_rate}%`}
            </span>
          </>
        )}
        {(pd.room_count || pd.bathroom_count) && (
          <>
            <span className="text-gray-500">방/욕실</span>
            <span>{pd.room_count ?? "-"}개 / {pd.bathroom_count ?? "-"}개</span>
          </>
        )}
        {pd.household_count_by_pyeong && (
          <>
            <span className="text-gray-500">해당면적 세대수</span>
            <span>{pd.household_count_by_pyeong}세대</span>
          </>
        )}
        {pd.entrance_type && (
          <>
            <span className="text-gray-500">현관구조</span>
            <span>{pd.entrance_type}</span>
          </>
        )}
        {pd.latest_maintenance_cost ? (
          <>
            <span className="text-gray-500">공용관리비</span>
            <span>{formatMaintCost(pd.latest_maintenance_cost, pd.maintenance_cost_basis)}</span>
          </>
        ) : pd.avg_maintenance_cost ? (
          <>
            <span className="text-gray-500">평균관리비</span>
            <span>{pd.avg_maintenance_cost.toLocaleString()}원</span>
          </>
        ) : null}
        {(pd.summer_maintenance_cost || pd.winter_maintenance_cost) && (
          <>
            <span className="text-gray-500">여름/겨울</span>
            <span>
              {pd.summer_maintenance_cost ? `${pd.summer_maintenance_cost.toLocaleString()}원` : "-"}
              {" / "}
              {pd.winter_maintenance_cost ? `${pd.winter_maintenance_cost.toLocaleString()}원` : "-"}
            </span>
          </>
        )}
      </div>
      {pd.floor_plan_url && (
        <div className="mt-2">
          <button onClick={() => setShowPlan(!showPlan)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            {showPlan ? "평면도 접기 ▲" : "평면도 보기 ▼"}
          </button>
          {showPlan && (
            <div className="mt-1">
              <Image src={pd.floor_plan_url} alt={`${pd.pyeong_name || pd.exclusive_area || ""} 평면도`} width={300} height={200} className="max-h-48 border rounded object-contain" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const AREA_FILTER_TOLERANCE_M2 = 4;

function PriceAreaTab({ priceStats, error, loading, onFilterChange }: { priceStats: PriceStats | null; error: boolean; loading: boolean; onFilterChange?: (filters: ArticleFilters) => void; }) {
  if (loading) return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>;
  if (error) return <p className="text-red-500 text-sm text-center">가격 통계를 불러오지 못했습니다</p>;
  if (!priceStats || priceStats.by_area.length === 0)
    return <p className="text-gray-500 text-sm text-center">면적별 가격 데이터가 부족합니다</p>;

  const handleAreaClick = (label: string) => {
    if (!onFilterChange) return;
    const match = label.match(/(\d+)/);
    if (!match) return;
    const area = parseInt(match[1], 10);
    onFilterChange({ min_area_m2: area - AREA_FILTER_TOLERANCE_M2, max_area_m2: area + AREA_FILTER_TOLERANCE_M2 });
  };

  return (
    <div>
      {onFilterChange && (
        <p className="text-xs text-gray-400 mb-1 text-right">막대를 클릭하면 해당 면적 매물만 표시됩니다</p>
      )}
      <LazyCharts type="area" data={priceStats.by_area} onAreaClick={onFilterChange ? handleAreaClick : undefined} />
    </div>
  );
}

function PriceFloorTab({ priceStats, error, loading, onFilterChange }: { priceStats: PriceStats | null; error: boolean; loading: boolean; onFilterChange?: (filters: ArticleFilters) => void; }) {
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
