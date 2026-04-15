import type { MbApartment } from "@/types";
import { downloadXlsxBuffer, safeCellValue } from "./compare-export";
import { MB_COMPARE_ROWS, formatCellValue } from "./mb-compare-utils";
import { today } from "./mb-export";

export async function exportMbCompareToXlsx(apartments: MbApartment[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("미분양 비교");
  ws.columns = [
    { header: "항목", width: 18 },
    ...apartments.map((a) => ({
      header: safeCellValue(a.name),
      width: 22,
    })),
  ];
  MB_COMPARE_ROWS.forEach((row) => {
    ws.addRow([
      safeCellValue(row.label),
      ...apartments.map((a) =>
        safeCellValue(formatCellValue(row.getValue(a))),
      ),
    ]);
  });
  const buf = await wb.xlsx.writeBuffer();
  await downloadXlsxBuffer(buf, `미분양비교_${today()}.xlsx`);
}
