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
}

export default function ComplexDashboardMobile({
  complex,
  complexNo,
  pyeongDetails,
  sessionToken,
  onFilterChange,
}: Props) {
  const [openSection, setOpenSection] = useState<SectionKey | "">("");
  const contentRef = useRef<HTMLDivElement>(null);
  const { avgPrice, count } = useComplexArticleAvg(complexNo);

  const handleCardClick = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? "" : key));
  };

  // openSection 변경 시 펼침 영역으로 스크롤 (기존 line 75-77 답습)
  useEffect(() => {
    if (openSection && contentRef.current) {
      requestAnimationFrame(() => {
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [openSection]);

  // 박스 라벨·값 계산 (Q3 NULL fallback)
  const boxes: BoxData[] = [
    {
      key: "prices",
      label: "시세",
      primary: complex.nearby_median_price != null
        ? formatKoreanPrice(complex.nearby_median_price)
        : (avgPrice != null ? `매물 평균 ${formatKoreanPrice(avgPrice)}` : "-"),
      secondary: complex.jeonse_rate != null
        ? `전세가율 ${complex.jeonse_rate}%`
        : (count > 0 ? `매물 ${count}건` : undefined),
    },
    {
      key: "chart",
      label: "실거래가",
      primary: complex.recent_trades_6m != null ? `${complex.recent_trades_6m}건` : `매물 ${count}건`,
      secondary: complex.recent_trades_6m != null ? "최근 6개월" : "현재 매물",
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
      {/* 바둑판 박스 4개 (2×2) */}
      <div className="grid grid-cols-2 gap-2" aria-label="단지 종합 대시보드">
        {boxes.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => handleCardClick(b.key)}
            aria-label={`${b.label} 메뉴 열기`}
            aria-expanded={openSection === b.key}
            aria-controls="dashboard-content"
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors min-h-20 ${
              openSection === b.key
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <span className="text-[11px] text-gray-500">{b.label}</span>
            <span className="text-sm font-semibold mt-0.5 break-keep">{b.primary}</span>
            {b.secondary && <span className="text-[10px] text-gray-400 mt-0.5">{b.secondary}</span>}
          </button>
        ))}
      </div>

      {/* 펼침 영역 (그리드 밖, 가로 전체) */}
      {openSection && (
        <div id="dashboard-content" ref={contentRef} role="region">
          <Card className="p-3">
            {openSection === "prices" && (
              <ComplexPriceFloorSection complexNo={complexNo} onFilterChange={onFilterChange} />
            )}
            {openSection === "chart" && (
              <PriceChartSection complexNo={complexNo} pyeongDetails={pyeongDetails} accessToken={sessionToken} />
            )}
            {openSection === "info" && <ComplexBasicInfo cpx={complex} />}
            {openSection === "area" && (
              <div className="space-y-3">
                {pyeongDetails.length > 0 ? (
                  <PyeongDetailsList details={pyeongDetails} />
                ) : (
                  <p className="text-gray-500 text-sm">면적별 정보가 아직 수집되지 않았습니다.</p>
                )}
                <ComplexPriceAreaSection complexNo={complexNo} onFilterChange={onFilterChange} />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
