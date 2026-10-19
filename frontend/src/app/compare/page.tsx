"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { getComplex, getPriceStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { M2_TO_PYEONG } from "@/lib/constants";
import { formatKoreanPrice } from "@/lib/format";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useSessionToken } from "@/hooks/useSessionToken";
import { calcAvgPricePerPyeong } from "@/lib/compare-utils";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SkeletonPage } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Scale } from "lucide-react";
import type { Complex, PriceStats } from "@/types";

const LazyCompareCharts = dynamic(
  () => import("@/components/CompareCharts"),
  { ssr: false },
);

/* ── 포맷 유틸 ── */

function formatArea(m2?: number): string {
  if (!m2) return "-";
  return `${m2.toFixed(0)}m² (${(m2 / M2_TO_PYEONG).toFixed(0)}평)`;
}

function formatCount(n?: number): string {
  return n ? n.toLocaleString() : "-";
}

function formatYear(ymd?: string): string {
  if (!ymd) return "-";
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  return m ? `${y}.${m}` : y;
}

function formatPrice(price?: number): string {
  if (!price) return "-";
  if (price >= 10000) return `${(price / 10000).toFixed(1)}억`;
  return `${price.toLocaleString()}만`;
}

/** 대표 면적 시세 — "59㎡ 1억 7,200만 (3건)". 대표 면적을 아직 못 정한 단지는 저장된 값만(옛 경로) */
function formatRepAreaPrice(c: Complex): string {
  if (c.rep_area_m2 == null) {
    // 대표 면적이 없는데 옛 값이 남은 단지 — 면적 섞인 옛 값임을 밝힌다(세션 474 보완 F2 · 사장님 결정 Q4)
    if (c.price_basis === "legacy_mixed" && c.nearby_median_price) {
      return `${formatKoreanPrice(c.nearby_median_price)} (면적 섞인 옛 값)`;
    }
    return formatPrice(c.nearby_median_price);
  }
  const price = c.nearby_median_price ? formatKoreanPrice(c.nearby_median_price) : "—";
  const count = c.recent_trades_6m != null ? ` (${c.recent_trades_6m}건)` : "";
  return `${c.rep_area_m2}㎡ ${price}${count}`;
}

/* ── 비교 테이블 행 정의 (기본 23행, 평당가는 동적 삽입) ── */

const BASE_ROWS: { label: string; render: (c: Complex) => ReactNode }[] = [
  { label: "주소", render: (c) => c.cortar_address || "-" },
  { label: "도로명주소", render: (c) => c.road_address || "-" },
  { label: "유형", render: (c) => c.real_estate_type_name || "-" },
  { label: "세대수", render: (c) => formatCount(c.total_household_count) },
  { label: "동수", render: (c) => formatCount(c.total_dong_count) },
  { label: "최저층", render: (c) => c.low_floor ? `${c.low_floor}층` : "-" },
  { label: "최고층", render: (c) => c.high_floor ? `${c.high_floor}층` : "-" },
  { label: "준공일", render: (c) => formatYear(c.use_approve_ymd) },
  { label: "최소 면적", render: (c) => formatArea(c.min_supply_area_m2) },
  { label: "최대 면적", render: (c) => formatArea(c.max_supply_area_m2) },
  { label: "총 주차", render: (c) => formatCount(c.total_parking_count) },
  { label: "세대당 주차", render: (c) => c.parking_count_by_household ? `${c.parking_count_by_household}대` : "-" },
  { label: "난방", render: (c) => c.heat_method_type || "-" },
  { label: "난방 연료", render: (c) => c.heat_fuel_type || "-" },
  { label: "시공사", render: (c) => c.construction_company || "-" },
  { label: "용적률", render: (c) => c.floor_area_ratio ? `${c.floor_area_ratio}%` : "-" },
  { label: "건폐율", render: (c) => c.building_coverage_ratio ? `${c.building_coverage_ratio}%` : "-" },
  // 평당가는 "건폐율" 다음에 동적 삽입 (compareRows useMemo 의 findIndex 참조)
  { label: "매물수", render: (c) => formatCount(c.article_count) },
  // 대표 면적 하나의 값(세션 474 B27, 사장님 결정 D3) — 카드·매물 전세가율 분모와 같은 숫자
  { label: "대표 면적 시세", render: (c) => formatRepAreaPrice(c) },
  { label: "전세가율(이 단지, 같은 면적)", render: (c) => c.jeonse_rate
    ? `${c.jeonse_rate.toFixed(0)}%${c.price_basis === "legacy_mixed" ? " (옛 값)" : ""}`
    : "-" },
  // 정부 지역 값(세션 473) — 각 단지의 시군구, 부동산원 최신 달
  { label: "시군구 전세가율(부동산원)", render: (c) => c.region_jeonse_ratio != null
    ? `${c.region_jeonse_ratio}%${c.region_jeonse_period ? ` (${c.region_jeonse_period})` : ""}`
    : "-" },
  { label: "수영장", render: (c) => c.has_pool ? "있음" : "없음" },
  { label: "관리사무소", render: (c) => c.management_office_tel || "-" },
];

/* 모바일 카드뷰 탭 분류 — BASE_ROWS + 동적 평당가 레이블과 정확히 일치해야 함 */
const ROW_CATEGORIES = {
  basic: new Set([
    "주소", "도로명주소", "유형", "세대수", "동수",
    "최저층", "최고층", "준공일", "최소 면적", "최대 면적",
  ]),
  price: new Set([
    "평당가", "매물수", "대표 면적 시세", "전세가율(이 단지, 같은 면적)", "시군구 전세가율(부동산원)",
  ]),
  facility: new Set([
    "총 주차", "세대당 주차", "난방", "난방 연료", "시공사",
    "용적률", "건폐율", "수영장", "관리사무소",
  ]),
} as const;

type MobileTab = keyof typeof ROW_CATEGORIES;

const MOBILE_TAB_LABELS: Record<MobileTab, string> = {
  basic: "기본",
  price: "가격",
  facility: "시설",
};

/*
 * 비교 화면 값들의 자료 출처 (세션 472 PR 3 — 판정 ★ 대신 값 + 출처 각주).
 * 근거: 단지 정보·평형(관리비·세대 구성) = 네이버 단지/평형 API(backend services/enricher.py),
 * 매물수·평당가·현재 평균가·층별·면적별 가격 = 살아 있는 매물 호가 집계(backend db/price_queries.py FROM articles),
 * 대표 면적 시세·가격 추이 기본선 = complex_area_trade_stats(국토교통부 실거래가 면적별, crawler/service_public.py) ·
 * 전세가율 = 네이버 전세 시세(complex_price_history B1, crawler/service_price.py) ÷ 정부 실거래 중위(crawler/service_metrics.py).
 */
const COMPARE_SOURCES_FOOTER_TEXT =
  "출처: 단지 정보·평형별 관리비·세대 구성 = 네이버부동산 단지 정보 · 매물수·평당가·현재 평균가·층별·면적별 가격 = 네이버부동산 매물 호가 집계(실거래가 아님) · 대표 면적 시세·가격 추이 기본선 = 국토교통부 실거래가(공공데이터포털) · 전세가율 = 네이버부동산 전세 시세 ÷ 정부 실거래 중위";

const COMPARE_REGION_FOOTNOTE_TEXT =
  "시군구 전세가율: 한국부동산원 전국주택가격동향조사, 아파트 중위 매매가격 대비 전세가격(각 단지의 시군구, 기준 달은 값 옆 괄호)";

/* ── 메인 컴포넌트 ── */

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const goBack = useSmartBack();
  const { sessionToken, tokenReady } = useSessionToken();
  const idsStr = searchParams.get("ids") || "";
  const ids = idsStr.split(",").filter(Boolean).slice(0, 4);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.complex(id),
      queryFn: () => getComplex(id),
      enabled: !!id,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  // React Query는 데이터 변경 없으면 동일 참조 반환 → 안정적 키로 memo
  const complexIds = queries.map((q) => q.data?.complex_no).filter(Boolean).join(",");
  const complexes = useMemo(
    () => queries.map((q) => q.data).filter(Boolean) as Complex[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [complexIds],
  );
  const failedIds = ids.filter((_, i) => queries[i]?.isError);
  const hasAnyError = failedIds.length > 0;

  /* 가격 통계 (React Query 캐시 공유 — CompareCharts와 동일 queryKey) */
  const statsQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.priceStats(id),
      queryFn: () => getPriceStats(id, sessionToken),
      // tokenReady 가드 (B2 게이트): 토큰 해석 후 실행 — 승인 중개사 잠금 오인 차단
      enabled: tokenReady,
      staleTime: 60_000,
    })),
  });
  const statsLoading = statsQueries.some((q) => q.isLoading);
  // useQueries 결과 배열은 렌더마다 새 참조라, 문자열 키로만 memo 한다.
  // memo 안에서는 키 문자열만 읽는다(react-hooks 검사가 의존성 = 본문 입력 일치를 요구).
  const idsKey = ids.join(",");
  const statsErrorKey = statsQueries.map((q) => (q.isError ? "1" : "0")).join(",");
  const statsErrorMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    const flags = statsErrorKey.split(",");
    idsKey.split(",").filter(Boolean).forEach((id, i) => { if (flags[i] === "1") m[id] = true; });
    return m;
  }, [idsKey, statsErrorKey]);

  /* 평당가 맵: { [complex_no]: 만원/평 } — 단지별 평당가(정수 또는 빈칸)를 키로 만든 뒤 memo */
  const ppKey = statsQueries
    .map((q) => {
      const data = q.data as PriceStats | undefined;
      const pp = data ? calcAvgPricePerPyeong(data) : null;
      return pp == null ? "" : String(pp);
    })
    .join(",");
  const pricePerPyeong: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    const pps = ppKey.split(",");
    idsKey.split(",").filter(Boolean).forEach((id, i) => {
      if (pps[i]) map[id] = Number(pps[i]);
    });
    return map;
  }, [idsKey, ppKey]);

  /* 비교 행: 기본 23행 + 평당가 동적 삽입 */
  const compareRows = useMemo(() => {
    const ppRow = {
      label: "평당가",
      render: (c: Complex) => {
        if (statsErrorMap[c.complex_no]) {
          return <span className="text-xs text-gray-400">불러오기 실패</span>;
        }
        const pp = pricePerPyeong[c.complex_no];
        if (pp != null) return formatPrice(pp);
        if (statsLoading) {
          return (
            <span
              className="inline-block w-16 h-4 bg-gray-200 rounded animate-pulse align-middle"
              aria-label="평당가 로딩 중"
            />
          );
        }
        return "-";
      },
    };
    // 평당가는 "건폐율" 행 다음(= 매물수 앞)에 삽입. BASE_ROWS 순서가 바뀌어도
    // 위치가 따라가도록 라벨로 찾는다. 못 찾으면(라벨 변경 등) 기존 위치 17로 폴백.
    const rows = [...BASE_ROWS];
    const bcrIdx = rows.findIndex((r) => r.label === "건폐율");
    rows.splice(bcrIdx >= 0 ? bcrIdx + 1 : 17, 0, ppRow);
    return rows;
  }, [pricePerPyeong, statsLoading, statsErrorMap]);

  /* ── 인쇄/엑셀 ── */
  const [expandAll, setExpandAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("basic");

  const mobileRows = useMemo(
    () => compareRows.filter((r) => ROW_CATEGORIES[mobileTab].has(r.label)),
    [compareRows, mobileTab],
  );

  const handlePrint = useCallback(() => {
    setExpandAll(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  // afterprint 복원 + 3초 백업
  useEffect(() => {
    const restore = () => setExpandAll(false);
    window.addEventListener("afterprint", restore);
    return () => window.removeEventListener("afterprint", restore);
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const { exportCompareToXlsx } = await import("@/lib/compare-export");
      await exportCompareToXlsx(complexes, compareRows);
    } catch (err) {
      alert(err instanceof Error ? err.message : "엑셀 다운로드에 실패했습니다");
    } finally {
      setIsExporting(false);
    }
  }, [complexes, compareRows]);

  if (ids.length < 2) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          icon={Scale}
          title="비교할 단지가 2개 이상 필요해요"
          description="검색 결과에서 ✓ 체크박스로 단지를 골라 비교 버튼을 누르거나, 단지 상세 페이지에서 비교에 추가해주세요."
          action={
            <button
              type="button"
              onClick={goBack}
              className="text-sm text-blue-600 hover:underline"
            >
              ← 돌아가기
            </button>
          }
        />
      </div>
    );
  }

  if (loading) return <SkeletonPage message="단지 정보를 불러오는 중..." />;

  if (complexes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="bg-red-50 text-red-700 rounded-md px-4 py-3 mb-4 inline-block">
          비교 단지 정보를 불러오지 못했습니다.
        </p>
        <div>
          <button
            type="button"
            onClick={() => queries.forEach((q) => q.refetch())}
            className="text-sm text-blue-600 hover:underline"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {hasAnyError && (
        <div role="alert" className="mb-4 bg-red-50 text-red-700 text-sm rounded-md px-3 py-2 flex items-center justify-between no-print">
          <span>{failedIds.length}개 단지 정보를 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => queries.forEach((q) => q.refetch())}
            className="text-red-700 underline"
          >
            다시 시도
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-6">
        {/* 터치 44px: 패딩+동치 음수마진 = 히트영역만 확장, 레이아웃 불변 (세션 299) */}
        <button onClick={goBack} aria-label="이전 페이지" className="px-3.5 py-2 -mx-3.5 -my-2 text-gray-400 hover:text-gray-600 text-xl no-print">
          &#8592;
        </button>
        <h1 className="text-xl md:text-2xl font-bold">단지 비교</h1>
        <span className="text-gray-500 text-sm">
          ({complexes.length}개 단지{ids.length !== complexes.length && ` / 선택 ${ids.length}개`})
        </span>
        <div className="ml-auto flex flex-wrap gap-2 no-print">
          <button
            onClick={() => router.push("/search")}
            className="px-3 py-1.5 text-sm border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50"
          >
            다른 단지 검색
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            인쇄
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isExporting ? "생성 중..." : "엑셀"}
          </button>
        </div>
      </div>

      {/* 비교 테이블 (데스크톱) */}
      <div className="hidden md:block print-show-md overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-28 sticky left-0 bg-gray-100 z-10">항목</th>
              {complexes.map((c) => (
                <th key={c.complex_no} className="px-4 py-3 text-center min-w-45">
                  <button
                    onClick={() => router.push(`/complex/${c.complex_no}`)}
                    className="text-blue-600 hover:underline font-semibold text-sm"
                  >
                    {c.complex_name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-inherit z-10">
                  {row.label}
                </td>
                {complexes.map((c) => (
                  <td
                    key={c.complex_no}
                    className="px-4 py-2 text-center border-r border-gray-100 last:border-r-0 text-gray-700"
                  >
                    {row.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 비교 카드 (모바일) */}
      <div className="md:hidden print-hide-md space-y-4">
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as MobileTab)}>
          <TabsList
            aria-label="비교 항목 분류"
            className="flex gap-1.5 bg-gray-100 rounded-lg p-1 sticky top-14 z-10 w-full h-auto"
          >
            {(Object.keys(MOBILE_TAB_LABELS) as MobileTab[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="flex-1 text-xs font-medium px-2 py-1.5 rounded-md transition-colors text-gray-600 hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm"
              >
                {MOBILE_TAB_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={mobileTab} className="mt-4 space-y-4">
            {complexes.map((c) => (
              <div key={c.complex_no} className="bg-white rounded-lg shadow-sm border p-4">
                <button
                  onClick={() => router.push(`/complex/${c.complex_no}`)}
                  className="text-blue-600 hover:underline font-semibold text-base mb-3 block"
                >
                  {c.complex_name}
                </button>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {mobileRows.map((row) => (
                    <Fragment key={row.label}>
                      <dt className="text-gray-500 text-xs">{row.label}</dt>
                      <dd className="text-gray-800">{row.render(c)}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* 차트 섹션 */}
      {complexes.length >= 2 && (
        <div className="mt-8" data-testid="compare-charts">
          <LazyCompareCharts
            complexes={complexes.map((c) => ({
              complex_no: c.complex_no,
              complex_name: c.complex_name,
            }))}
            expandAll={expandAll}
            accessToken={sessionToken}
            tokenReady={tokenReady}
          />
        </div>
      )}

      {/* 값의 자료 출처 각주 (세션 472 PR 3) */}
      <p className="mt-8 text-xs leading-relaxed text-gray-500" data-testid="compare-sources-footer">
        {COMPARE_SOURCES_FOOTER_TEXT}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500" data-testid="compare-region-footnote">
        {COMPARE_REGION_FOOTNOTE_TEXT}
      </p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CompareContent />
    </Suspense>
  );
}
