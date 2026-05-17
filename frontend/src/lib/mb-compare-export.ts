import type { MbApartment } from "@/types";
import { buildCompareXlsx, safeCellValue } from "./compare-export";
import { MB_COMPARE_ROWS, formatCellValue } from "./mb-compare-utils";
import { today } from "./mb-export";

export async function exportMbCompareToXlsx(apartments: MbApartment[]) {
  await buildCompareXlsx({
    sheetName: "미분양 비교",
    itemHeader: { label: "항목", width: 18 },
    columns: apartments.map((a) => ({
      header: safeCellValue(a.name),
      width: 22,
    })),
    rows: MB_COMPARE_ROWS.map((row) => [
      safeCellValue(row.label),
      ...apartments.map((a) => safeCellValue(formatCellValue(row.getValue(a)))),
    ]),
    filename: `미분양비교_${today()}.xlsx`,
  });
}
