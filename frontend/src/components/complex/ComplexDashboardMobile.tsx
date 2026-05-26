"use client";

import { useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import ComplexBasicInfo from "@/components/ComplexBasicInfo";
import { PyeongDetailsList } from "@/components/ComplexPyeongCard";
import ComplexPriceFloorSection from "@/components/complex/ComplexPriceFloorSection";
import ComplexPriceAreaSection from "@/components/complex/ComplexPriceAreaSection";
import PriceChartSection from "@/components/complex/PriceChartSection";
import { formatKoreanPrice } from "@/lib/format";
import type { ArticleFilters, Complex, PyeongDetail } from "@/types";

type SectionKey = "prices" | "chart" | "info" | "pyeong" | "area";

interface Props {
  complex: Complex;
  complexNo: string;
  pyeongDetails: PyeongDetail[];
  sessionToken: string | undefined;
  onFilterChange: (filters: ArticleFilters) => void;
}

interface SummaryCardData {
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

  const summaries: SummaryCardData[] = [
    {
      key: "prices",
      label: "시세",
      primary: formatKoreanPrice(complex.nearby_median_price),
      secondary: complex.jeonse_rate != null ? `전세가율 ${complex.jeonse_rate}%` : undefined,
    },
    {
      key: "chart",
      label: "실거래가",
      primary: complex.recent_trades_6m != null ? `${complex.recent_trades_6m}건` : "-",
      secondary: "최근 6개월",
    },
    {
      key: "info",
      label: "단지정보",
      primary: complex.total_household_count != null ? `${complex.total_household_count.toLocaleString()}세대` : "-",
      secondary: complex.total_dong_count != null ? `${complex.total_dong_count}개동` : undefined,
    },
    {
      key: "pyeong",
      label: "평형",
      primary: pyeongDetails.length > 0 ? `${pyeongDetails.length}개` : "-",
      secondary: "타입별",
    },
    {
      key: "area",
      label: "면적별 시세",
      primary: complex.nearby_median_price != null ? "보기" : "-",
      secondary: "㎡당",
    },
  ];

  const handleCardClick = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? "" : key));
    requestAnimationFrame(() => {
      const el = document.getElementById(`dashboard-${key}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2" aria-label="단지 종합 대시보드">
        {summaries.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => handleCardClick(s.key)}
            aria-label={`${s.label} 메뉴 열기`}
            aria-expanded={openSection === s.key ? "true" : "false"}
            className={`flex flex-col items-start rounded-lg border p-2 text-left transition-colors ${
              openSection === s.key
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <span className="text-[11px] text-gray-500">{s.label}</span>
            <span className="text-sm font-semibold mt-0.5">{s.primary}</span>
            {s.secondary && <span className="text-[10px] text-gray-400 mt-0.5">{s.secondary}</span>}
          </button>
        ))}
      </div>

      <Accordion
        type="single"
        collapsible
        value={openSection}
        onValueChange={(v) => setOpenSection(v as SectionKey | "")}
        className="space-y-2"
      >
        <AccordionItem value="prices" id="dashboard-prices">
          <AccordionTrigger className="px-3">시세</AccordionTrigger>
          <AccordionContent className="px-3">
            <Card className="p-3">
              <ComplexPriceFloorSection complexNo={complexNo} onFilterChange={onFilterChange} />
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="chart" id="dashboard-chart">
          <AccordionTrigger className="px-3">실거래가 추이</AccordionTrigger>
          <AccordionContent className="px-3">
            <Card className="p-3">
              <PriceChartSection complexNo={complexNo} pyeongDetails={pyeongDetails} accessToken={sessionToken} />
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="info" id="dashboard-info">
          <AccordionTrigger className="px-3">단지 정보</AccordionTrigger>
          <AccordionContent className="px-3">
            <Card className="p-3">
              <ComplexBasicInfo cpx={complex} />
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pyeong" id="dashboard-pyeong">
          <AccordionTrigger className="px-3">평형</AccordionTrigger>
          <AccordionContent className="px-3">
            {pyeongDetails.length > 0 ? (
              <Card className="p-3">
                <PyeongDetailsList details={pyeongDetails} />
              </Card>
            ) : (
              <p className="text-gray-500 text-sm px-3">면적별 정보가 아직 수집되지 않았습니다.</p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="area" id="dashboard-area">
          <AccordionTrigger className="px-3">면적별 시세</AccordionTrigger>
          <AccordionContent className="px-3">
            <Card className="p-3">
              <ComplexPriceAreaSection complexNo={complexNo} onFilterChange={onFilterChange} />
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
