"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import ComplexBasicInfo from "@/components/ComplexBasicInfo";
import { PyeongDetailsList } from "@/components/ComplexPyeongCard";
import ComplexPriceFloorSection from "@/components/complex/ComplexPriceFloorSection";
import ComplexPriceAreaSection from "@/components/complex/ComplexPriceAreaSection";
import PriceChartSection from "@/components/complex/PriceChartSection";
import RepAreaTradeList from "@/components/complex/RepAreaTradeList";
import { useComplexArticleAvg } from "@/hooks/useComplexArticleAvg";
import { formatKoreanPrice } from "@/lib/format";
import { otherAreaText, pickRepresentativeArea } from "@/lib/area-group";
import {
  areaRangeSummary,
  legacyRangeTexts,
  percentRangeText,
  repChipText,
  repPrimaryText,
} from "@/lib/range-price";
import type { ArticleFilters, Complex, PyeongDetail } from "@/types";

type SectionKey = "prices" | "chart" | "info" | "area";

interface Props {
  complex: Complex;
  complexNo: string;
  pyeongDetails: PyeongDetail[];
  /** 평형표 응답을 받았나(성공·실패 모두) — 받기 전엔 매매 평균을 띄우지 않는다(세션 475 보완). 기본 true */
  pyeongReady?: boolean;
  sessionToken: string | undefined;
  /** 비로그인 확정 — 네이버 매물·호가·추이 요청 없이 잠금 카드(세션 481 보완 F4). 기본 false */
  loggedOut?: boolean;
  /** 승인 중개사 — 실거래가 자동 수집(네이버 호출)은 이때만(세션 481 보완 F6). 기본 false */
  canAct?: boolean;
  onFilterChange: (filters: ArticleFilters) => void;
}

interface BoxData {
  key: SectionKey;
  label: string;
  primary: string;
  secondary?: string;
  /** 라벨 옆 작은 표시 — "최근 6개월 3건"(세션 474 B27) */
  chip?: string;
  /** 값 아래 작은 줄 — 대표 면적 전세가율·지역 값(세션 474 B27) */
  extra?: string;
  /** 칸 아래 작은 출처 줄 — 정부 값이 붙었을 때만(세션 473) */
  note?: string;
}

export default function ComplexDashboard({
  complex,
  complexNo,
  pyeongDetails,
  pyeongReady = true,
  sessionToken,
  loggedOut = false,
  canAct = false,
  onFilterChange,
}: Props) {
  const [openSection, setOpenSection] = useState<SectionKey | "">("");
  const [isPrinting, setIsPrinting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // 매매 매물 평균은 시세 칸 대체값 — 대표 면적도 시세도 없을 때만 요청, 면적은 평형표 세대수 최다 묶음(세션 475 PR 6).
  // 평형표를 받기 전엔 요청하지 않는다 — 면적 없이 낸 평균이 묶음 평균으로 한 번 바뀌는 것을 막는다(보완)
  const avgEnabled = complex.rep_area_m2 == null && complex.nearby_median_price == null && pyeongReady;
  const avgArea = avgEnabled ? pickRepresentativeArea(pyeongDetails) : null;
  const { avgPrice, count, isLoading: countLoading, isError: countError } = useComplexArticleAvg(complexNo, sessionToken, {
    avgEnabled,
    avgAreaM2: avgArea,
    enabled: !loggedOut,
  });
  // 불러오는 중엔 count=0 이라 "매물 0건"이 잠깐 보이던 것을 막는다(세션 447)
  // 비로그인은 매물 API 가 401 이라 "매물 0건" 대신 로그인 안내(세션 481)
  const countText = countLoading
    ? "매물 …건"
    : loggedOut || (countError && !sessionToken)
      ? "로그인하면 보여요"
      : `매물 ${count}건`;

  const handleCardClick = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? "" : key));
  };

  // 모바일에서만 펼침 영역으로 자동 스크롤. 데스크톱은 viewport 안에 다 보임
  useEffect(() => {
    if (
      openSection &&
      contentRef.current &&
      typeof window !== "undefined" &&
      window.innerWidth < 768
    ) {
      requestAnimationFrame(() => {
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [openSection]);

  // 인쇄 시 4 박스 본문 모두 펼침 (기존 데스크톱 자동 노출 답습, /compare 패턴 답습)
  useEffect(() => {
    const beforePrint = () => setIsPrinting(true);
    const afterPrint = () => setIsPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  // 정부 지역 값(부동산원 시군구 전세가율) — 이 단지 값 옆에 나란히, 출처 줄과 함께(세션 473)
  // 출처 문구는 BE(region_jeonse_source)가 정본 — 화면에 글자 상수를 또 두지 않는다(derived-display-ssot).
  const hasRegionJeonse = complex.region_jeonse_ratio != null && !!complex.region_name;
  const regionJeonseText = hasRegionJeonse ? ` · ${complex.region_name} 아파트 ${complex.region_jeonse_ratio}%` : "";
  const regionSourceText = hasRegionJeonse && complex.region_jeonse_source
    ? `지역: ${complex.region_jeonse_source}${complex.region_jeonse_period ? `(${complex.region_jeonse_period})` : ""}`
    : null;

  const regionOnlyText = hasRegionJeonse ? `${complex.region_name} 아파트 전세가율 ${complex.region_jeonse_ratio}%` : undefined;

  // 시세 칸 — 대표 면적이 있으면 그 면적 최저~최고 크게 + 다른 면적 작게(세션 474 B27 · 479 B29 범위화).
  // 칩 N = 대표 면적 거래 목록 길이(펼친 목록 줄 수와 같은 출처). 출처 글자(area_price_range_source)는 BE 정본.
  const rep = complex.rep_area_m2 ?? null;
  const repArea = rep != null ? complex.area_prices?.find((ap) => ap.area_m2 === rep) : undefined;
  const repHouseholds = repArea?.households;
  const repSummary = areaRangeSummary(repArea);
  // 이 단지 전세가율은 분자가 네이버 전세 시세라 비로그인 응답엔 칸 자체가 없다(세션 481) — 없거나 비면 지역 값만
  const jeonseText = percentRangeText(complex.jeonse_rate_min, complex.jeonse_rate_max);
  // 옛 값 단지(대표 면적 없음) — 마지막 정부 섞인 줄의 범위 + 그 달 작은 줄(사장님 결정 ㄱ, 전세가율은 비움)
  const isLegacy = complex.price_basis === "legacy_mixed";
  const legacyTexts = isLegacy ? legacyRangeTexts(complex.legacy_range) : null;
  const pricesBox: BoxData = rep != null
    ? {
        key: "prices",
        label: `시세 · 전용 ${rep}㎡${repHouseholds ? `(${repHouseholds.toLocaleString()}세대)` : ""}`,
        chip: repChipText(repSummary),
        primary: repPrimaryText(repSummary),
        secondary: otherAreaText(rep, complex.area_prices ?? []) || undefined,
        extra: jeonseText != null ? `전세가율(${rep}㎡) ${jeonseText}${regionJeonseText}` : regionOnlyText,
        note: complex.area_price_range_source
          ? `이 단지: ${complex.area_price_range_source}${regionSourceText ? ` · ${regionSourceText}` : ""}`
          : (regionSourceText ?? undefined),
      }
    : {
        key: "prices",
        label: "시세",
        primary: isLegacy
          ? (legacyTexts?.value ?? "—")
          : (avgPrice != null
            ? `매매 매물 평균${avgArea != null ? `(${avgArea}㎡)` : ""} ${formatKoreanPrice(avgPrice)}`
            : "-"),
        extra: legacyTexts?.note,
        secondary: regionOnlyText ?? (countLoading || count > 0 ? countText : undefined),
        note: regionSourceText ?? undefined,
      };

  // 박스 라벨·값 계산 (Q3 NULL fallback)
  const boxes: BoxData[] = [
    pricesBox,
    {
      key: "chart",
      label: "실거래가",
      // recent_trades_6m 은 실제 거래 횟수가 아니라 시세 기록 줄 수라 "거래 N건"으로 보여 주지 않는다(세션 429)
      primary: countText,
      secondary: "현재 매물",
    },
    {
      key: "info",
      label: "단지정보",
      primary: complex.total_household_count != null
        ? `${complex.total_household_count.toLocaleString()}세대`
        : "-",
      secondary: complex.total_dong_count != null ? `${complex.total_dong_count}개동` : undefined,
    },
    {
      key: "area",
      label: "면적별 시세",
      primary: pyeongDetails.length > 0 ? `${pyeongDetails.length}개 평형` : "-",
      secondary: "타입별 / ㎡당",
    },
  ];

  return (
    <div className="space-y-4">
      {/* 바둑판 박스 4개 (모바일 2×2 / 데스크톱 4×1) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3" aria-label="단지 종합 대시보드">
        {boxes.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => handleCardClick(b.key)}
            aria-label={`${b.label} 메뉴 열기`}
            aria-expanded={openSection === b.key}
            aria-controls="dashboard-content"
            className={`flex flex-col items-start rounded-lg border p-3 md:p-4 text-left transition-colors min-h-20 ${
              openSection === b.key
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <span className="text-[11px] md:text-xs text-gray-500">
              {b.label}
              {b.chip && (
                <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700 break-keep" data-testid={`box-chip-${b.key}`}>
                  {b.chip}
                </span>
              )}
            </span>
            {/* 범위 "2억 4,500만 ~ 2억 8,500만" 이 가격 하나 안("2억 / 8,500만")에서 줄이 갈리지 않게 억 뒤 띄어쓰기만 붙인다(390px) */}
            <span className="text-sm md:text-base font-semibold mt-0.5 break-keep">{b.primary.replace(/억 (?=\d)/g, "억\u00a0")}</span>
            {b.secondary && <span className="text-[10px] md:text-xs text-gray-400 mt-0.5 break-keep">{b.secondary}</span>}
            {b.extra && <span className="text-[10px] md:text-xs text-gray-500 mt-0.5 break-keep" data-testid={`box-extra-${b.key}`}>{b.extra}</span>}
            {b.note && <span className="text-[10px] text-gray-400 mt-0.5" data-testid={`box-note-${b.key}`}>{b.note}</span>}
          </button>
        ))}
      </div>

      {/* 펼침 영역 (그리드 밖, 가로 전체). 인쇄 시 4 박스 본문 모두 노출 */}
      {(openSection || isPrinting) && (
        <div id="dashboard-content" ref={contentRef} role="region">
          <Card className="p-3 md:p-4 space-y-4">
            {(openSection === "prices" || isPrinting) && rep != null && (
              <RepAreaTradeList areaM2={rep} trades={repArea?.trades ?? []} />
            )}
            {(openSection === "prices" || isPrinting) && (
              <ComplexPriceFloorSection complexNo={complexNo} onFilterChange={onFilterChange} accessToken={sessionToken} loggedOut={loggedOut} />
            )}
            {(openSection === "chart" || isPrinting) && (
              <PriceChartSection complexNo={complexNo} pyeongDetails={pyeongDetails} accessToken={sessionToken} repAreaM2={complex.rep_area_m2} loggedOut={loggedOut} canAct={canAct} />
            )}
            {(openSection === "info" || isPrinting) && <ComplexBasicInfo cpx={complex} />}
            {(openSection === "area" || isPrinting) && (
              <div className="space-y-3">
                {pyeongDetails.length > 0 ? (
                  <PyeongDetailsList details={pyeongDetails} />
                ) : (
                  <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>
                )}
                <ComplexPriceAreaSection complexNo={complexNo} onFilterChange={onFilterChange} accessToken={sessionToken} loggedOut={loggedOut} />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
