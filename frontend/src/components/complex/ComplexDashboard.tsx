"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import ComplexBasicInfo from "@/components/ComplexBasicInfo";
import { PyeongDetailsList } from "@/components/ComplexPyeongCard";
import ComplexPriceFloorSection from "@/components/complex/ComplexPriceFloorSection";
import ComplexPriceAreaSection from "@/components/complex/ComplexPriceAreaSection";
import PriceChartSection from "@/components/complex/PriceChartSection";
import { useComplexArticleAvg } from "@/hooks/useComplexArticleAvg";
import { formatKoreanPrice } from "@/lib/format";
import { LEGACY_NOTE, otherAreaText, pickRepresentativeArea } from "@/lib/area-group";
import type { ArticleFilters, Complex, PyeongDetail } from "@/types";

type SectionKey = "prices" | "chart" | "info" | "area";

interface Props {
  complex: Complex;
  complexNo: string;
  pyeongDetails: PyeongDetail[];
  sessionToken: string | undefined;
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
  sessionToken,
  onFilterChange,
}: Props) {
  const [openSection, setOpenSection] = useState<SectionKey | "">("");
  const [isPrinting, setIsPrinting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // 매매 매물 평균은 시세 칸 대체값 — 대표 면적도 시세도 없을 때만 요청, 면적은 평형표 세대수 최다 묶음(세션 475 PR 6)
  const avgEnabled = complex.rep_area_m2 == null && complex.nearby_median_price == null;
  const avgArea = avgEnabled ? pickRepresentativeArea(pyeongDetails) : null;
  const { avgPrice, count, isLoading: countLoading } = useComplexArticleAvg(complexNo, sessionToken, {
    avgEnabled,
    avgAreaM2: avgArea,
  });
  // 불러오는 중엔 count=0 이라 "매물 0건"이 잠깐 보이던 것을 막는다(세션 447)
  const countText = countLoading ? "매물 …건" : `매물 ${count}건`;

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

  // 시세 칸 — 대표 면적이 있으면 그 면적 값 크게 + 다른 면적 작게(세션 474 B27, 사장님 결정 D3 「A」).
  // 출처 글자(area_price_source)는 BE 정본. 대표 면적이 없으면 옛 경로(시세 → 매물 평균 대체값) 그대로.
  const rep = complex.rep_area_m2 ?? null;
  const repHouseholds = rep != null ? complex.area_prices?.find((ap) => ap.area_m2 === rep)?.households : undefined;
  const pricesBox: BoxData = rep != null
    ? {
        key: "prices",
        label: `시세 · 전용 ${rep}㎡${repHouseholds ? `(${repHouseholds.toLocaleString()}세대)` : ""}`,
        chip: complex.recent_trades_6m != null ? `최근 6개월 ${complex.recent_trades_6m}건` : undefined,
        primary: complex.nearby_median_price != null ? formatKoreanPrice(complex.nearby_median_price) : "—",
        secondary: otherAreaText(rep, complex.area_prices ?? []) || undefined,
        extra: `전세가율(${rep}㎡) ${complex.jeonse_rate != null ? `${complex.jeonse_rate}%` : "—"}${regionJeonseText}`,
        note: complex.area_price_source
          ? `이 단지: ${complex.area_price_source}${regionSourceText ? ` · ${regionSourceText}` : ""}`
          : (regionSourceText ?? undefined),
      }
    : {
        key: "prices",
        label: "시세",
        primary: complex.nearby_median_price != null
          ? formatKoreanPrice(complex.nearby_median_price)
          : (avgPrice != null
            ? `매매 매물 평균${avgArea != null ? `(${avgArea}㎡)` : ""} ${formatKoreanPrice(avgPrice)}`
            : "-"),
        // 대표 면적이 없는데 옛 값이 남은 단지 — 면적이 섞인 옛 값임을 작게 밝힌다(사장님 결정 Q4)
        extra: complex.price_basis === "legacy_mixed" ? LEGACY_NOTE : undefined,
        secondary: complex.jeonse_rate != null
          ? `전세가율 ${complex.jeonse_rate}%${regionJeonseText}`
          : hasRegionJeonse
            ? `${complex.region_name} 아파트 전세가율 ${complex.region_jeonse_ratio}%`
            : (countLoading || count > 0 ? countText : undefined),
        note: regionSourceText
          ? (complex.jeonse_rate != null
            ? `이 단지: 최근 6개월 시세·실거래 기록 중앙값으로 계산 · ${regionSourceText}`
            : regionSourceText)
          : undefined,
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
                <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700" data-testid={`box-chip-${b.key}`}>
                  {b.chip}
                </span>
              )}
            </span>
            <span className="text-sm md:text-base font-semibold mt-0.5 break-keep">{b.primary}</span>
            {b.secondary && <span className="text-[10px] md:text-xs text-gray-400 mt-0.5">{b.secondary}</span>}
            {b.extra && <span className="text-[10px] md:text-xs text-gray-500 mt-0.5" data-testid={`box-extra-${b.key}`}>{b.extra}</span>}
            {b.note && <span className="text-[10px] text-gray-400 mt-0.5" data-testid={`box-note-${b.key}`}>{b.note}</span>}
          </button>
        ))}
      </div>

      {/* 펼침 영역 (그리드 밖, 가로 전체). 인쇄 시 4 박스 본문 모두 노출 */}
      {(openSection || isPrinting) && (
        <div id="dashboard-content" ref={contentRef} role="region">
          <Card className="p-3 md:p-4 space-y-4">
            {(openSection === "prices" || isPrinting) && (
              <ComplexPriceFloorSection complexNo={complexNo} onFilterChange={onFilterChange} accessToken={sessionToken} />
            )}
            {(openSection === "chart" || isPrinting) && (
              <PriceChartSection complexNo={complexNo} pyeongDetails={pyeongDetails} accessToken={sessionToken} repAreaM2={complex.rep_area_m2} />
            )}
            {(openSection === "info" || isPrinting) && <ComplexBasicInfo cpx={complex} />}
            {(openSection === "area" || isPrinting) && (
              <div className="space-y-3">
                {pyeongDetails.length > 0 ? (
                  <PyeongDetailsList details={pyeongDetails} />
                ) : (
                  <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>
                )}
                <ComplexPriceAreaSection complexNo={complexNo} onFilterChange={onFilterChange} accessToken={sessionToken} />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
