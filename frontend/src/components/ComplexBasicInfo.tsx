"use client";

import { useQuery } from "@tanstack/react-query";
import type { Complex, OfficialPriceItem } from "@/types";
import { formatDateFull, formatKoreanPrice } from "@/lib/format";
import { getOfficialPrices, getComplexSubway, getComplexKapt } from "@/lib/api/complex";
import { formatSubwayStations } from "@/lib/subway-format";
import { formatCostPerHousehold, formatCostBreakdown } from "@/lib/kapt-format";
import { queryKeys } from "@/lib/query-keys";

/**
 * 대표평형 = 세대수(ho_count)가 가장 많은 평형.
 * 동률이면 전용면적(prvuse_ar) 오름차순 첫 번째 — BE 가 이미 prvuse_ar 오름차순으로
 * 정렬해 내려주므로(routers/complexes.py:338), 엄격 부등호 비교로 첫 최대값을 유지한다.
 */
function pickRepresentative(items: OfficialPriceItem[]): OfficialPriceItem | null {
  let best: OfficialPriceItem | null = null;
  for (const it of items) {
    if (best === null || it.ho_count > best.ho_count) best = it;
  }
  return best;
}

/**
 * 공시가율(%) = 공시가격 ÷ 주변시세 × 100.
 *
 * ⚠ 단위 통일: price_median 은 **원** 단위(BE V-WORLD 원본 그대로 — PR-C
 * PropertyTaxComplexPicker.tsx:122 가 /10_000 으로 만원 환산),
 * nearby_median_price 는 **만원** 단위(ComplexPriceHistory.price_avg =
 * 네이버 averagePrice, ComplexDashboard.tsx:79 formatKoreanPrice 사용).
 * 따라서 공시가격을 만원으로 환산한 뒤 나눈다.
 *
 * 표시는 소수 1자리 반올림 — 프로젝트 % 표기 관례(전세가율 toFixed(1)) 답습.
 */
function calcOfficialPriceRatio(
  priceMedianWon: number,
  nearbyMedianManwon: number,
): number | null {
  if (!(nearbyMedianManwon > 0)) return null;
  const officialManwon = priceMedianWon / 10_000;
  return Math.round((officialManwon / nearbyMedianManwon) * 1000) / 10;
}

/** 단지 기본정보 탭 — 주소, 세대수, 층수, 주차 등 */
export default function ComplexBasicInfo({ cpx }: { cpx: Complex }) {
  // 공동주택 공시가격 (무료 공개, 게이트 없음). 래퍼가 에러를 그대로 throw 하므로
  // 실패 시 data 는 undefined → 아래에서 행 자체가 추가되지 않는다 (부가 정보 행이라
  // 별도 에러 UI 없이 미표시가 이 컴포넌트의 기존 관례 — 값 없으면 행 생략).
  // queryKeys.officialPrices 는 PR-C 와 동일 키 → React Query 자동 dedupe.
  const officialQuery = useQuery({
    queryKey: queryKeys.officialPrices(cpx.complex_no),
    queryFn: () => getOfficialPrices(cpx.complex_no),
    enabled: !!cpx.complex_no,
    staleTime: 60_000,
  });

  // 인근 지하철역 (거리순 최대 3개). officialQuery 와 동일 구조 — 래퍼가 에러를 그대로
  // throw 하므로 실패 시 data 는 undefined → 행 자체가 추가되지 않는다.
  const subwayQuery = useQuery({
    queryKey: queryKeys.complexSubway(cpx.complex_no),
    queryFn: () => getComplexSubway(cpx.complex_no),
    enabled: !!cpx.complex_no,
    staleTime: 60_000,
  });

  // 공동주택 관리비 (K-apt). 위 두 쿼리와 같은 구조지만 404 만 다르게 다룬다 — 래퍼가
  // "데이터 없음"(404)을 null 로 변환하므로, 관리비가 원래 없는 대다수 단지에서 isError
  // 가 뜨지 않는다. 5xx 는 래퍼가 throw → data 는 undefined → 행 미표시(기존 관례).
  const kaptQuery = useQuery({
    queryKey: queryKeys.complexKapt(cpx.complex_no),
    queryFn: () => getComplexKapt(cpx.complex_no),
    enabled: !!cpx.complex_no,
    staleTime: 60_000,
  });

  // [라벨, 값, 보조텍스트?] — 보조텍스트는 값 아래 작은 회색 글씨로 표시(관리비 총액 등)
  const rows: [string, string, string?][] = [];
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
  if (cpx.trade_type_counts) {
    const tc = cpx.trade_type_counts;
    const parts = (["매매", "전세", "월세", "단기임대"] as const)
      .filter((t) => tc[t] > 0)
      .map((t) => `${t} ${tc[t]}`);
    if (parts.length > 0) rows.push(["거래유형별 매물", parts.join(" · ")]);
  }

  // 가까운 지하철 — 역이 없거나(빈 배열) 조회 실패면 행 자체를 추가하지 않는다.
  const subwayText = formatSubwayStations(subwayQuery.data?.stations ?? []);
  if (subwayText) rows.push(["가까운 지하철", subwayText]);

  // 월 관리비 + 복도유형 (K-apt). 매칭·관리비가 없는 단지(404 → null)나 조회 실패면
  // 행 자체를 추가하지 않는다 — 빈 상태 문구 없이 생략하는 것이 이 컴포넌트의 관례.
  const kapt = kaptQuery.data;
  if (kapt) {
    const costText = formatCostPerHousehold(kapt.cost_per_household, kapt.cost_month);
    if (costText) rows.push(["월 관리비", costText, formatCostBreakdown(kapt) ?? undefined]);
    if (kapt.corridor_type) rows.push(["복도유형", kapt.corridor_type]);
  }

  // 공시가격 + 공시가율 (둘 다 무료). 데이터 없으면 행 자체를 추가하지 않는다.
  const representative = pickRepresentative(officialQuery.data?.items ?? []);
  if (representative) {
    const year = officialQuery.data?.year;
    rows.push([
      `공시가격(대표평형 중위${year ? `, ${year}년` : ""})`,
      formatKoreanPrice(Math.round(representative.price_median / 10_000)),
    ]);
    if (cpx.nearby_median_price != null) {
      const ratio = calcOfficialPriceRatio(representative.price_median, cpx.nearby_median_price);
      if (ratio != null) rows.push(["공시가율(공시가격÷주변시세)", `${ratio.toFixed(1)}%`]);
    }
  }

  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm">단지 상세 정보가 아직 수집되지 않았습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {rows.map(([label, value, sub]) => (
        <div key={label} className="flex gap-2">
          <span className="text-sm text-gray-500 font-medium shrink-0 w-24">{label}</span>
          <span className="text-sm">
            {value}
            {sub && <span className="block text-xs text-gray-500">{sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
