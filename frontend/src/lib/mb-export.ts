/**
 * 미분양 데이터 엑셀 내보내기 — 클라이언트 사이드 exceljs
 */
import type { MbApartment, MbRegion, MbTrade, MbUnsoldHistory } from "@/types";
import { downloadXlsxBuffer, safeCellValue } from "./compare-export";

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function s(val: unknown): string {
  if (val == null) return "";
  return safeCellValue(String(val));
}

async function buildWorkbook(
  sheetName: string,
  header: string[],
  rows: string[][],
  colWidth: number,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = header.map((h) => ({ header: h, width: colWidth }));
  rows.forEach((row) => ws.addRow(row));
  return wb.xlsx.writeBuffer();
}

/** 미분양 단지 목록 엑셀 */
export async function exportMbApartmentsToXlsx(apartments: MbApartment[]) {
  const header = ["단지명", "지역", "시군구", "세대수", "미분양", "미분양률(%)", "입주시기", "시공사", "분양가(최저)", "분양가(최고)", "평당가", "할인율(%)"];
  const data = apartments.map((a) => [
    s(a.name), s(a.region), s(a.gu), s(a.units), s(a.unsold),
    a.unsold_rate != null ? s(a.unsold_rate.toFixed(1)) : "",
    s(a.presale_move_in ?? a.completion), s(a.builder),
    s(a.presale_min_price), s(a.presale_max_price), s(a.presale_pp),
    a.discount_pct != null ? s(a.discount_pct.toFixed(1)) : "",
  ]);
  const buf = await buildWorkbook("미분양단지", header, data, 14);
  await downloadXlsxBuffer(buf, `미분양단지_${today()}.xlsx`);
}

/** 지역 통계 엑셀 — ㎡당시세·초기분양률·토지비율 (단계 2 신규 노출 3 필드 SSOT 동기화) */

export async function exportMbRegionsToXlsx(regions: MbRegion[]) {
  const header = ["지역", "시군구", "인구", "세대수", "미분양", "인구증감(%)", "평균소득", "공급률", "전세가율(%)", "평균가격", "㎡당시세", "초기분양률(%)", "토지비율(%)"];
  const data = regions.map((r) => [
    s(r.region), s(r.gu), s(r.population), s(r.households), s(r.regional_unsold),
    r.pop_growth != null ? s(r.pop_growth.toFixed(1)) : "",
    s(r.avg_income), s(r.supply_ratio), s(r.jeonse_rate), s(r.avg_price),
    s(r.avg_price_sqm),
    r.initial_sale_rate != null ? s(r.initial_sale_rate.toFixed(1)) : "",
    r.land_cost_ratio != null ? s(r.land_cost_ratio.toFixed(1)) : "",
  ]);
  const buf = await buildWorkbook("지역통계", header, data, 12);
  await downloadXlsxBuffer(buf, `지역통계_${today()}.xlsx`);
}

/** 실거래 엑셀 */
export async function exportMbTradesToXlsx(trades: MbTrade[]) {
  const header = ["단지명", "지역", "시군구", "동", "거래월", "면적(m²)", "가격(만원)", "층", "건축년도", "거래유형", "취소일"];
  const data = trades.map((t) => [
    s(t.apt_name), s(t.region), s(t.gu), s(t.dong), s(t.deal_month),
    t.area != null ? s(t.area.toFixed(1)) : "",
    s(t.price), s(t.floor), s(t.build_year), s(t.trade_type), s(t.cancel_date),
  ]);
  const buf = await buildWorkbook("실거래", header, data, 12);
  await downloadXlsxBuffer(buf, `실거래_${today()}.xlsx`);
}

/** 미분양 추이 엑셀 */
export async function exportMbUnsoldHistoryToXlsx(items: MbUnsoldHistory[], aptName: string) {
  const header = ["기준월", "미분양", "준공후미분양", "증감"];
  const data = items.map((h) => [
    s(h.base_month), s(h.unsold_count), s(h.post_completion_unsold), s(h.change),
  ]);
  const buf = await buildWorkbook("미분양추이", header, data, 14);
  await downloadXlsxBuffer(buf, `미분양추이_${safeCellValue(aptName)}_${today()}.xlsx`);
}
