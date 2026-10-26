"use client";

/**
 * 소비자 단지 화면 「C 질문형」(세션 482 PR 1b, 설계 design-pr1b.md §3) — 비로그인·일반 회원이 보는 한 장.
 * 질문 4개 순서: 얼마짜리 → 어떻게 변해 왔나 → 주변은 → 내 돈으로 가능한가. 맨 아래(S5)는 페이지가 footer 로 넘긴다.
 * 네이버 재료는 쓰지 않는다 — 단지 응답(비로그인이면 BE 가 걷어냄)·공시가격·K-apt·지하철·동네·공개 가격 기록·지역 흐름만.
 * 공시가격·지하철·관리비·동네 쿼리 키는 ComplexBasicInfo 와 같아 자동으로 한 번만 부른다.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Complex } from "@/types";
import {
  getComplexKapt,
  getComplexNeighborhood,
  getComplexSubway,
  getOfficialPrices,
  getPublicPriceHistory,
  getRegionTrend,
} from "@/lib/api/complex";
import { queryKeys } from "@/lib/query-keys";
import { zoneOfCortar } from "@/lib/loan/regulation-codes";
import { secondLienLimit } from "@/lib/loan/secondLien";
import { Card } from "@/components/ui/card";
import ConsumerHeader, { type ConsumerSummary } from "./ConsumerHeader";
import LoanEstimateSection from "./LoanEstimateSection";
import NeighborhoodSection from "./NeighborhoodSection";
import PriceRangeSection from "./PriceRangeSection";
import PriceTrendSection from "./PriceTrendSection";
import {
  currentYm,
  hasRange,
  isOfficetel,
  officialForArea,
  priceStage,
  representativeOfficial,
  wonToManwon,
} from "./consumer-format";

/** 실패한 쿼리가 있으면 그것만 다시 받는 함수, 없으면 undefined(보완 A-4) */
function retryOf(...qs: { isError: boolean; refetch: () => unknown }[]): (() => void) | undefined {
  if (!qs.some((q) => q.isError)) return undefined;
  return () => qs.forEach((q) => { if (q.isError) void q.refetch(); });
}

export const CONSUMER_SOURCE_LINE = "출처: 국토교통부 실거래가·공시가격, K-apt, 한국부동산원, 국가데이터처 SGIS";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  /** S5 오른쪽 칸(넓은 화면에선 4번 카드 아래) — 비로그인 잠금 카드 */
  aside?: ReactNode;
  /** S5 아래 전체 폭 — 일반 회원 매물 섹션 */
  footer?: ReactNode;
  /** 띠 그래프 마지막 달(시험용 고정) — 없으면 오늘 달 */
  endYm?: string;
}

/**
 * 기본 면적 = 대표 면적(범위가 있을 때) → 범위가 있는 첫 면적 → (6개월 범위가 하나도 없으면) 대표 면적 → 면적 목록 첫 면적 → null.
 * 6개월 범위가 없어도 면적을 골라 두어야 2년 범위(B1)를 부를 수 있다(보완 F5).
 */
export function defaultArea(complex: Complex): number | null {
  const list = complex.area_prices ?? [];
  const rep = list.find((a) => a.area_m2 === complex.rep_area_m2);
  if (hasRange(rep)) return rep.area_m2;
  return list.find(hasRange)?.area_m2 ?? complex.rep_area_m2 ?? list[0]?.area_m2 ?? null;
}

export default function ConsumerComplexView({ complex, aside, footer, endYm, ...header }: Props) {
  const no = complex.complex_no;
  const [area, setArea] = useState<number | null>(() => defaultArea(complex));
  const areaPrices = complex.area_prices ?? [];
  const selected = areaPrices.find((a) => a.area_m2 === area);

  const officialQuery = useQuery({ queryKey: queryKeys.officialPrices(no), queryFn: () => getOfficialPrices(no), staleTime: 60_000 });
  const kaptQuery = useQuery({ queryKey: queryKeys.complexKapt(no), queryFn: () => getComplexKapt(no), staleTime: 60_000 });
  const subwayQuery = useQuery({ queryKey: queryKeys.complexSubway(no), queryFn: () => getComplexSubway(no), staleTime: 60_000 });
  const hoodQuery = useQuery({ queryKey: queryKeys.complexNeighborhood(no), queryFn: () => getComplexNeighborhood(no), staleTime: 60_000 });
  // 오피스텔은 정부 실거래를 받지 않는다 — 공개 가격 기록을 부르지 않고 대출 카드도 숨긴다(보완 F4)
  const officetel = isOfficetel(complex);
  const historyQuery = useQuery({
    queryKey: queryKeys.publicPriceHistory(no, area),
    queryFn: () => getPublicPriceHistory(no, area),
    enabled: area != null && !officetel,
    staleTime: 60_000,
  });
  const trendQuery = useQuery({ queryKey: queryKeys.regionTrend(no), queryFn: () => getRegionTrend(no), staleTime: 60_000 });

  const zone = zoneOfCortar(complex.cortar_no);
  const regionLabel = complex.region_name || trendQuery.data?.region_name || complex.sigungu;
  // 면적을 바꾼 직후 옛 면적 기록이 잠깐 남지 않게 — 응답 면적이 지금 선택과 같을 때만 쓴다
  const history = historyQuery.data && historyQuery.data.area_m2 === area ? historyQuery.data : null;
  const twoYear = history?.two_year ? { min: history.two_year.min, max: history.two_year.max } : null;
  // 2년 범위 답을 받았나 — 받기 전·실패면 "2년 기록 없음"을 단정하지 않는다
  const twoYearReady = area == null || history != null;

  // 머리 요약 = 대출 카드와 같은 집값 단계(결정 12) · 가진 집 기준(카드 기본 모드) · 선순위 0
  const stage = priceStage(selected, twoYear);
  let summary: ConsumerSummary | null = null;
  if (!officetel) {
    if (stage.kind !== "manual") {
      summary = {
        kind: "range",
        area,
        period: stage.kind,
        min: stage.min,
        max: stage.max,
        ltv: secondLienLimit({ mode: "own", price: stage.min, zone, sido: complex.sido }).available,
        zoneUnknown: zone == null,
      };
    } else if (twoYearReady && !historyQuery.isError) {
      summary = { kind: "manual" };
    }
  }

  // 직접 입력 단계의 참고 글자 — 선택 면적 ±1㎡ 공시가격(면적을 모르면 대표 평형)
  const officialItems = officialQuery.data?.items ?? [];
  const officialItem = area != null ? officialForArea(officialItems, area) : representativeOfficial(officialItems);

  return (
    <div className="space-y-4">
      {/* 넓은 화면(lg+)은 2열 — 왼쪽 3 = 머리·1·2·3, 오른쪽 2 = 4 대출 카드 + 잠금 카드(그림 C-desk). 휴대폰은 한 열 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start" data-testid="consumer-grid">
        <div className="space-y-4 min-w-0">
          <ConsumerHeader complex={complex} summary={summary} {...header} />
          <PriceRangeSection
            areaPrices={areaPrices}
            selected={area}
            onSelect={setArea}
            twoYear={twoYear}
            twoYearReady={twoYearReady}
            official={officialQuery.data}
            kapt={kaptQuery.data}
            rangeSource={complex.area_price_range_source}
            officetel={officetel}
            onRetry={retryOf(officialQuery, kaptQuery, historyQuery)}
          />
          <PriceTrendSection
            history={officetel ? null : history}
            trend={trendQuery.data}
            endYm={endYm ?? currentYm()}
            onRetry={retryOf(historyQuery, trendQuery)}
          />
          <NeighborhoodSection
            stations={subwayQuery.data?.stations ?? []}
            neighborhood={hoodQuery.data}
            onRetry={retryOf(subwayQuery, hoodQuery)}
          />
        </div>
        <div className="space-y-4 min-w-0">
          {officetel ? (
            <Card className="p-4" data-testid="consumer-loan-skip">
              <p className="text-xs text-gray-600">오피스텔(비주택) 담보대출은 주택 규칙과 달라 계산하지 않아요</p>
            </Card>
          ) : (
            <LoanEstimateSection
              areaPrices={areaPrices}
              selected={area}
              onSelect={setArea}
              zone={zone}
              sido={complex.sido}
              regionLabel={regionLabel}
              twoYear={twoYear}
              officialManwon={officialItem ? wonToManwon(officialItem.price_median) : null}
              onRetry={stage.kind === "6m" ? undefined : retryOf(historyQuery, officialQuery)}
            />
          )}
          {aside}
        </div>
      </div>
      {footer}
      <p className="text-xs text-gray-400">{CONSUMER_SOURCE_LINE}</p>
    </div>
  );
}
