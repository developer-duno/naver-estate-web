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
import ConsumerHeader from "./ConsumerHeader";
import LoanEstimateSection from "./LoanEstimateSection";
import NeighborhoodSection from "./NeighborhoodSection";
import PriceRangeSection from "./PriceRangeSection";
import PriceTrendSection from "./PriceTrendSection";
import { currentYm, hasRange } from "./consumer-format";

export const CONSUMER_SOURCE_LINE = "출처: 국토교통부 실거래가·공시가격, K-apt, 한국부동산원, 국가데이터처 SGIS";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  /** S5 — 비로그인 잠금 카드 / 일반 회원 매물 섹션 */
  footer?: ReactNode;
  /** 띠 그래프 마지막 달(시험용 고정) — 없으면 오늘 달 */
  endYm?: string;
}

/** 기본 면적 = 대표 면적(범위가 있을 때), 아니면 범위가 있는 첫 면적, 없으면 null */
export function defaultArea(complex: Complex): number | null {
  const list = complex.area_prices ?? [];
  const rep = list.find((a) => a.area_m2 === complex.rep_area_m2);
  if (hasRange(rep)) return rep.area_m2;
  return list.find(hasRange)?.area_m2 ?? null;
}

export default function ConsumerComplexView({ complex, footer, endYm, ...header }: Props) {
  const no = complex.complex_no;
  const [area, setArea] = useState<number | null>(() => defaultArea(complex));
  const areaPrices = complex.area_prices ?? [];
  const selected = areaPrices.find((a) => a.area_m2 === area);

  const officialQuery = useQuery({ queryKey: queryKeys.officialPrices(no), queryFn: () => getOfficialPrices(no), staleTime: 60_000 });
  const kaptQuery = useQuery({ queryKey: queryKeys.complexKapt(no), queryFn: () => getComplexKapt(no), staleTime: 60_000 });
  const subwayQuery = useQuery({ queryKey: queryKeys.complexSubway(no), queryFn: () => getComplexSubway(no), staleTime: 60_000 });
  const hoodQuery = useQuery({ queryKey: queryKeys.complexNeighborhood(no), queryFn: () => getComplexNeighborhood(no), staleTime: 60_000 });
  const historyQuery = useQuery({
    queryKey: queryKeys.publicPriceHistory(no, area),
    queryFn: () => getPublicPriceHistory(no, area),
    enabled: area != null,
    staleTime: 60_000,
  });
  const trendQuery = useQuery({ queryKey: queryKeys.regionTrend(no), queryFn: () => getRegionTrend(no), staleTime: 60_000 });

  const zone = zoneOfCortar(complex.cortar_no);
  const regionLabel = complex.region_name || trendQuery.data?.region_name || complex.sigungu;
  const summary = hasRange(selected)
    ? {
        area: selected.area_m2,
        min: selected.price_min,
        max: selected.price_max,
        ltv: secondLienLimit({ price: selected.price_min, zone, sido: complex.sido }).regionLimit,
      }
    : null;
  // 면적을 바꾼 직후 옛 면적 기록이 잠깐 남지 않게 — 응답 면적이 지금 선택과 같을 때만 쓴다
  const history = historyQuery.data && historyQuery.data.area_m2 === area ? historyQuery.data : null;

  return (
    <div className="space-y-4">
      <div className="space-y-4 max-w-3xl">
        <ConsumerHeader complex={complex} summary={summary} {...header} />
        <PriceRangeSection
          areaPrices={areaPrices}
          selected={area}
          onSelect={setArea}
          twoYear={history?.two_year ?? null}
          official={officialQuery.data}
          kapt={kaptQuery.data}
          rangeSource={complex.area_price_range_source}
        />
        <PriceTrendSection history={history} trend={trendQuery.data} endYm={endYm ?? currentYm()} />
        <NeighborhoodSection stations={subwayQuery.data?.stations ?? []} neighborhood={hoodQuery.data} />
        <LoanEstimateSection
          areaPrices={areaPrices}
          selected={area}
          onSelect={setArea}
          zone={zone}
          sido={complex.sido}
          regionLabel={regionLabel}
        />
      </div>
      {footer}
      <p className="text-xs text-gray-400">{CONSUMER_SOURCE_LINE}</p>
    </div>
  );
}
