"use client";

import type { Article, Complex } from "@/types";
import { M2_TO_PYEONG } from "@/lib/constants";
import { formatDateFull, formatMaintenanceCost, formatKoreanPrice } from "@/lib/format";

interface Props {
  article: Article;
  complex?: Complex;
}

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "-") return null;
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-right ml-4">{value}</span>
    </div>
  );
}

export function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-gray-50/50 p-4">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      {children}
    </div>
  );
}

export default function InfoCards({ article: a, complex: c }: Props) {
  const areaM2 = a.area2_m2 ?? a.area1_m2;
  const pyeong = areaM2 ? Math.round((areaM2 / M2_TO_PYEONG) * 10) / 10 : null;

  // 공식 기준값(세션 473) — 우리 판정 라벨((낮음)/(높음)/(주의)) 대신 부동산원·법령 기준을 나란히
  // (전세 보증 가입 한도 줄은 사장님 결정 ⓑ 2026-10-18 로 PR 5 뒤로 미뤘다)
  const isWolse = a.trade_type_name === "월세";
  const regionConvLabel = `${a.region_rent_conversion_name ?? "시도"} 전환율(부동산원·종합주택)`;
  const showLegalCap = isWolse && a.legal_rent_conversion_cap != null;
  const legalCapText = showLegalCap
    ? `${a.legal_rent_conversion_cap!.toFixed(1)}% (${
        a.legal_rent_conversion_cap! < 10 && a.bok_base_rate != null
          ? `기준금리 ${a.bok_base_rate.toFixed(2)}%+2%p`
          : "연 10%"
      })`
    : null;
  const sourceParts = [
    a.article_rent_conversion_rate != null && a.article_rent_conversion_basis
      ? `이 매물 전환율 = ${a.article_rent_conversion_basis}`
      : null,
    a.region_rent_conversion_rate != null
      ? `한국부동산원 전월세전환율(종합주택${a.region_rent_conversion_period ? `, ${a.region_rent_conversion_period}` : ""})`
      : null,
    showLegalCap ? "주택임대차보호법 제7조의2·시행령 제9조(연 1할·연 2%) — 새 계약 월세에는 적용되지 않음" : null,
  ].filter(Boolean);

  const basicItems: [string, string | undefined | null][] = [
    ["단지명", a.complex_name],
    ["동/층", `${a.building_name ?? "-"} / ${a.floor_info ?? "-"}`],
    ["전용면적", areaM2 ? `${areaM2}㎡ (${pyeong}평)` : null],
    ["공급면적", a.area1_m2 ? `${a.area1_m2}㎡` : null],
    ["방/욕실", `${a.room_count ?? "-"} / ${a.bathroom_count ?? "-"}`],
    ["방향", a.direction],
    ["입주가능일", formatDateFull(a.move_in_date)],
    ["관리비", formatMaintenanceCost(a.maintenance_cost, a.numeric_maintenance_cost)],
    ["난방방식", a.heating_type],
    ["주차", a.parking_count],
    ["총층수", a.total_floor_count ? `${a.total_floor_count}층` : null],
    ["준공일", a.is_presale ? "미준공 (분양권)" : formatDateFull(a.use_approve_ymd)],
    ["주소", a.jibun_address ?? a.complex_address],
    ["매물유형", a.article_real_estate_type_name],
    ["전월세전환율(이 매물)", a.article_rent_conversion_rate != null ? `${a.article_rent_conversion_rate}%` : null],
    [regionConvLabel, a.region_rent_conversion_rate != null ? `${a.region_rent_conversion_rate}%` : null],
    ["법정 상한(보증금을 월세로 바꿀 때)", legalCapText],
    ["전세가율(매물)", a.article_jeonse_ratio != null ? `${a.article_jeonse_ratio}%` : null],
    ["동일주소 매물", a.same_addr_cnt != null && a.same_addr_cnt > 1 ? `${a.same_addr_cnt}건 (${a.same_addr_min_prc ?? "-"} ~ ${a.same_addr_max_prc ?? "-"})` : null],
    ["사진 수", a.site_image_count != null && a.site_image_count > 0 ? `${a.site_image_count}장` : null],
    ["분양권 프리미엄", a.is_presale && a.same_addr_premium_min ? `${a.same_addr_premium_min} ~ ${a.same_addr_premium_max ?? "-"}` : null],
    ["지하철 도보시간", a.walking_time_to_subway != null && a.walking_time_to_subway > 0 ? `도보 ${a.walking_time_to_subway}분` : null],
    ["분양권 유형", a.isale_right_type_name],
  ];

  const complexItems: [string, string | undefined | null][] = c
    ? [
        ["건설사", c.construction_company],
        ["총세대", c.total_household_count ? `${c.total_household_count.toLocaleString()}세대` : null],
        ["총동수", c.total_dong_count ? `${c.total_dong_count}동` : null],
        ["용적률", c.floor_area_ratio ? `${c.floor_area_ratio}%` : null],
        ["건폐율", c.building_coverage_ratio ? `${c.building_coverage_ratio}%` : null],
        ["세대당주차", c.parking_count_by_household ? `${c.parking_count_by_household}대` : null],
        ["주변시세", c.nearby_median_price ? formatKoreanPrice(c.nearby_median_price) : null],
        ["전세가율", c.jeonse_rate ? `${c.jeonse_rate}%` : null],
        ["관리사무소", c.management_office_tel],
      ]
    : [];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <InfoCard title="매물 기본정보">
        {basicItems.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
        {sourceParts.length > 0 && (
          <p className="mt-2 text-xs leading-relaxed text-gray-500" data-testid="article-standards-source">
            출처: {sourceParts.join(" · ")}
          </p>
        )}
      </InfoCard>

      {complexItems.some(([, v]) => v && v !== "-") && (
        <InfoCard title="단지 상세정보">
          {complexItems.map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </InfoCard>
      )}
    </div>
  );
}
