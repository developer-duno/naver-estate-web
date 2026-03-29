import type { MbApartment } from "@/types";
import { safeCellValue } from "./compare-export";
import { MB_COMPARE_ROWS, formatCellValue } from "./mb-compare-utils";
import { today } from "./mb-export";

export async function exportMbCompareToXlsx(apartments: MbApartment[]) {
  const XLSX = await import("xlsx");
  const header = ["항목", ...apartments.map((a) => safeCellValue(a.name))];
  const data = MB_COMPARE_ROWS.map((row) => [
    safeCellValue(row.label),
    ...apartments.map((a) => safeCellValue(formatCellValue(row.getValue(a)))),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = [{ wch: 18 }, ...apartments.map(() => ({ wch: 22 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "미분양 비교");
  XLSX.writeFile(wb, `미분양비교_${today()}.xlsx`);
}
