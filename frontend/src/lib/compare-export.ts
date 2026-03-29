import type { Complex } from "@/types";

/** 엑셀 수식 인젝션 방어 — 백엔드 _safe_excel()과 동일 패턴 */
export function safeCellValue(val: string): string {
  if (!val) return "";
  if ("=+@-\t\r".includes(val[0])) return "'" + val;
  return val;
}

export async function exportCompareToXlsx(
  complexes: Complex[],
  rows: { label: string; render: (c: Complex) => string }[],
) {
  try {
    const XLSX = await import("xlsx");
    const header = ["항목", ...complexes.map((c) => safeCellValue(c.complex_name))];
    const data = rows.map((row) => [
      safeCellValue(row.label),
      ...complexes.map((c) => safeCellValue(row.render(c))),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "단지 비교");
    ws["!cols"] = [{ wch: 15 }, ...complexes.map(() => ({ wch: 25 }))];
    XLSX.writeFile(
      wb,
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
