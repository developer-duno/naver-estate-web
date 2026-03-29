/**
 * 미분양 데이터 엑셀 내보내기 — 클라이언트 사이드 xlsx
 */
import type { MbApartment, MbRegion, MbTrade, MbUnsoldHistory } from "@/types";
import { safeCellValue } from "./compare-export";

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function s(val: unknown): string {
  if (val == null) return "";
  return safeCellValue(String(val));
}

/** 미분양 단지 목록 엑셀 */
export async function exportMbApartmentsToXlsx(apartments: MbApartment[]) {
  const XLSX = await import("xlsx");
  const header = ["단지명", "지역", "시군구", "세대수", "미분양", "미분양률(%)", "입주시기", "시공사", "분양가(최저)", "분양가(최고)", "평당가"];
  const data = apartments.map((a) => [
    s(a.name), s(a.region), s(a.gu), s(a.units), s(a.unsold),
    a.unsold_rate != null ? s(a.unsold_rate.toFixed(1)) : "",
    s(a.presale_move_in ?? a.completion), s(a.builder),
    s(a.presale_min_price), s(a.presale_max_price), s(a.presale_pp),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = header.map(() => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "미분양단지");
  XLSX.writeFile(wb, `미분양단지_${today()}.xlsx`);
}

/** 지역 통계 엑셀 */
export async function exportMbRegionsToXlsx(regions: MbRegion[]) {
  const XLSX = await import("xlsx");
  const header = ["지역", "시군구", "인구", "세대수", "미분양", "인구증감(%)", "평균소득", "공급률", "전세가율(%)", "평균가격"];
  const data = regions.map((r) => [
    s(r.region), s(r.gu), s(r.population), s(r.households), s(r.regional_unsold),
    r.pop_growth != null ? s(r.pop_growth.toFixed(1)) : "",
    s(r.avg_income), s(r.supply_ratio), s(r.jeonse_rate), s(r.avg_price),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = header.map(() => ({ wch: 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "지역통계");
  XLSX.writeFile(wb, `지역통계_${today()}.xlsx`);
}

/** 실거래 엑셀 */
export async function exportMbTradesToXlsx(trades: MbTrade[]) {
  const XLSX = await import("xlsx");
  const header = ["단지명", "지역", "시군구", "동", "거래월", "면적(m²)", "가격(만원)", "층", "건축년도", "거래유형", "취소일"];
  const data = trades.map((t) => [
    s(t.apt_name), s(t.region), s(t.gu), s(t.dong), s(t.deal_month),
    t.area != null ? s(t.area.toFixed(1)) : "",
    s(t.price), s(t.floor), s(t.build_year), s(t.trade_type), s(t.cancel_date),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = header.map(() => ({ wch: 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "실거래");
  XLSX.writeFile(wb, `실거래_${today()}.xlsx`);
}

/** 미분양 추이 엑셀 */
export async function exportMbUnsoldHistoryToXlsx(items: MbUnsoldHistory[], aptName: string) {
  const XLSX = await import("xlsx");
  const header = ["기준월", "미분양", "준공후미분양", "증감"];
  const data = items.map((h) => [
    s(h.base_month), s(h.unsold_count), s(h.post_completion_unsold), s(h.change),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = header.map(() => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "미분양추이");
  XLSX.writeFile(wb, `미분양추이_${safeCellValue(aptName)}_${today()}.xlsx`);
}
