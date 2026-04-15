import type { Complex } from "@/types";

/** 엑셀 수식 인젝션 방어 — 백엔드 _safe_excel()과 동일 패턴 */
export function safeCellValue(val: string): string {
  if (!val) return "";
  if ("=+@-\t\r".includes(val[0])) return "'" + val;
  return val;
}

/** ExcelJS 버퍼 → Blob 다운로드 (브라우저 전용) */
export async function downloadXlsxBuffer(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
) {
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportCompareToXlsx(
  complexes: Complex[],
  rows: { label: string; render: (c: Complex) => string }[],
) {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("단지 비교");
    ws.columns = [
      { header: "항목", width: 15 },
      ...complexes.map((c) => ({
        header: safeCellValue(c.complex_name),
        width: 25,
      })),
    ];
    rows.forEach((row) => {
      ws.addRow([
        safeCellValue(row.label),
        ...complexes.map((c) => safeCellValue(row.render(c))),
      ]);
    });
    const buf = await wb.xlsx.writeBuffer();
    await downloadXlsxBuffer(
      buf,
      `단지비교_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `엑셀 생성 실패: ${err.message}`
        : "엑셀 생성에 실패했습니다",
    );
  }
}
