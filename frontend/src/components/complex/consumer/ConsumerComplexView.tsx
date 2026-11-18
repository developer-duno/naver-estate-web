"use client";

/**
 * 소비자 단지 화면 「C 질문형」(세션 482 PR 1b, 설계 design-pr1b.md §3) — 비로그인·일반 회원이 보는 한 장.
 * 세션 524 B40 PR 1 순서(휴대폰 한 열): 머리 → 최근 거래 → 2년 동안 어떻게 변했나 → 이 집을 담보로(대출 판) → 주변은 어떤가 → 잠금 카드.
 * 맨 아래(S5)는 페이지가 footer 로 넘긴다.
 * 네이버 재료는 쓰지 않는다 — 단지 응답(비로그인이면 BE 가 걷어냄)·공시가격·K-apt·지하철·동네·공개 가격 기록·지역 흐름만.
 * 공시가격·지하철·동네 쿼리 키는 ComplexBasicInfo 와 같아 자동으로 한 번만 부른다. 공시가격·지하철은 서버 요약을 initialData 로
 * 받아 브라우저가 다시 부르지 않는다(세션 483 PR 3b). 관리비는 '한눈에 보기' 표(서버)로 옮겨 여기선 부르지 않는다.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Complex, OfficialPriceResponse, SubwayNearResponse } from "@/types";
import type { ClientSeed } from "@/types/public-summary";
import { basisToYm } from "@/lib/seo/complex-page";
import {
  getComplexNeighborhood,
  getComplexSubway,
  getOfficialPrices,
  getPublicPriceHistory,
  getRegionTrend,
} from "@/lib/api/complex";
import { queryKeys } from "@/lib/query-keys";
import { zoneOfCortar } from "@/lib/loan/regulation-codes";
import BrandCard from "@/components/brand/BrandCard";
import ConsumerHeader from "./ConsumerHeader";
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
  /** 비로그인 잠금 카드 — 넓은 화면에선 왼쪽 열 맨 아래(세션 524 B40 PR 1 · 설계 §3 lg 왼쪽 = 3·4·5·7·8) */
  aside?: ReactNode;
  /** S5 아래 전체 폭 — 일반 회원 매물 섹션 */
  footer?: ReactNode;
  /** 띠 그래프 마지막 달(시험용 고정) — 없으면 서버 기준월(seed.basis_ym), 그것도 없으면 오늘 달 */
  endYm?: string;
  /** 서버 공개 요약 중 화면 재료(세션 483 PR 3b) — 공시가격·지하철 initialData · 지역·동 링크 · 기준월 */
  seed?: ClientSeed | null;
}

/** 서버가 준 공시가격·지하철은 거의 안 바뀐다(공시 연 1회·역 고정) — 하루 동안 다시 받지 않는다 */
const SEED_STALE_MS = 86_400_000;

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

export default function ConsumerComplexView({ complex, aside, footer, endYm, seed: rawSeed, ...header }: Props) {
  const no = complex.complex_no;
  // 다른 단지 재료가 섞이지 않게 — 번호가 같을 때만 쓴다
  const seed = rawSeed && rawSeed.complex_no === no ? rawSeed : null;
  const [area, setArea] = useState<number | null>(() => defaultArea(complex));
  const areaPrices = complex.area_prices ?? [];
  const selected = areaPrices.find((a) => a.area_m2 === area);

  // initialData = 서버 요약과 같은 모양인 두 쿼리만(공시가격·지하철) — 관리비·가격 기록은 모양이 달라 넣지 않는다(v2 🟡)
  const officialSeed: OfficialPriceResponse | undefined = seed
    ? { complex_no: no, year: seed.official_price?.year ?? null, items: seed.official_price?.items ?? [] }
    : undefined;
  const subwaySeed: SubwayNearResponse | undefined = seed ? { stations: seed.subway ?? [] } : undefined;
  const officialQuery = useQuery({
    queryKey: queryKeys.officialPrices(no),
    queryFn: () => getOfficialPrices(no),
    staleTime: officialSeed ? SEED_STALE_MS : 60_000,
    initialData: officialSeed,
  });
  const subwayQuery = useQuery({
    queryKey: queryKeys.complexSubway(no),
    queryFn: () => getComplexSubway(no),
    staleTime: subwaySeed ? SEED_STALE_MS : 60_000,
    initialData: subwaySeed,
  });
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

  // 대출 판 집값 단계(결정 12) — 6개월 범위가 있으면 다시 시도 단추를 안 둔다
  const stage = priceStage(selected, twoYear);

  // 직접 입력 단계의 참고 글자 — 선택 면적 ±1㎡ 공시가격(면적을 모르면 대표 평형)
  const officialItems = officialQuery.data?.items ?? [];
  const officialItem = area != null ? officialForArea(officialItems, area) : representativeOfficial(officialItems);

  return (
    <div className="space-y-4">
      {/* 휴대폰 한 열 = DOM 순서 그대로(order 로 뒤집지 않는다). 넓은 화면(lg+) 2열 — 대출 판만 오른쪽 열 1행부터 끝 행까지,
          나머지는 왼쪽 열에 차례로(오른쪽이 차 있어 자동으로 왼쪽). 왼쪽 카드 행은 auto, 마지막 1fr 행이 대출 판의 남는 높이를 받아
          계산기를 펼쳐도 왼쪽 카드 사이 간격이 그대로다(세션 524 B40 PR 1). */}
      <div
        className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[repeat(5,auto)_1fr]"
        data-testid="consumer-grid"
      >
        <ConsumerHeader complex={complex} {...header} />
        <PriceRangeSection
          areaPrices={areaPrices}
          selected={area}
          onSelect={setArea}
          twoYear={twoYear}
          twoYearReady={twoYearReady}
          official={officialQuery.data}
          officetel={officetel}
          onRetry={retryOf(officialQuery, historyQuery)}
        />
        <PriceTrendSection
          history={officetel ? null : history}
          trend={trendQuery.data}
          endYm={endYm ?? basisToYm(seed?.basis_ym) ?? currentYm()}
          onRetry={retryOf(historyQuery, trendQuery)}
          breadcrumb={seed?.breadcrumb ?? null}
        />
        <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-6" data-testid="consumer-loan-col">
          {officetel ? (
            <BrandCard className="p-4" data-testid="consumer-loan-skip">
              <p className="text-xs text-brand-muted">오피스텔(비주택) 담보대출은 주택 규칙과 달라 계산하지 않아요</p>
            </BrandCard>
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
        </div>
        <NeighborhoodSection
          stations={subwayQuery.data?.stations ?? []}
          neighborhood={hoodQuery.data}
          onRetry={retryOf(subwayQuery, hoodQuery)}
          breadcrumb={seed?.breadcrumb ?? null}
        />
        {aside}
      </div>
      {footer}
      <p className="text-xs text-brand-muted">{CONSUMER_SOURCE_LINE}</p>
    </div>
  );
}
