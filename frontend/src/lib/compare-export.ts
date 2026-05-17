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

/** ReactNode → 엑셀 셀용 string 변환 (string 이 아니면 "-" 로 fallback) */
function toCellText(value: unknown): string {
  return typeof value === "string" ? value : "-";
}

/**
 * 비교용 엑셀 워크북 생성 + 다운로드 — 단지 비교·미분양 비교 공통.
 * 첫 열은 "항목" 라벨, 나머지 열은 비교 대상. columns·rows 의 모든
 * 문자열은 호출부에서 safeCellValue 적용을 마친 상태로 넘겨야 한다
 * (수식 인젝션 방어 책임은 호출부 — 데이터 모델을 아는 쪽).
 */
export async function buildCompareXlsx(opts: {
  sheetName: string;
  itemHeader: { label: string; width: number };
  columns: { header: string; width: number }[];
  rows: string[][];
  filename: string;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName);
  ws.columns = [
    { header: opts.itemHeader.label, width: opts.itemHeader.width },
    ...opts.columns,
  ];
  opts.rows.forEach((row) => ws.addRow(row));
  const buf = await wb.xlsx.writeBuffer();
  await downloadXlsxBuffer(buf, opts.filename);
}

export async function exportCompareToXlsx(
  complexes: Complex[],
  rows: { label: string; render: (c: Complex) => unknown }[],
) {
  try {
    await buildCompareXlsx({
      sheetName: "단지 비교",
      itemHeader: { label: "항목", width: 15 },
      columns: complexes.map((c) => ({
        header: safeCellValue(c.complex_name),
        width: 25,
      })),
      rows: rows.map((row) => [
        safeCellValue(row.label),
        ...complexes.map((c) => safeCellValue(toCellText(row.render(c)))),
      ]),
      filename: `단지비교_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `엑셀 생성 실패: ${err.message}`
        : "엑셀 생성에 실패했습니다",
    );
  }
}
