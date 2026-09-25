/**
 * 비교 엑셀 내보내기 왕복 테스트 — exceljs 를 mock 하지 않고 실제로 만든 파일을
 * 다시 열어 손님이 받는 엑셀의 시트·셀 값이 맞는지 확인한다.
 * (compare-export.test.ts 는 exceljs 를 가짜로 바꿔 호출 흐름·오류 처리만 본다)
 * 실행: npx vitest run src/lib/__tests__/compare-export-roundtrip.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import ExcelJS from "exceljs";
import type { Complex, MbApartment } from "@/types";
import { exportCompareToXlsx } from "../compare-export";
import { exportMbCompareToXlsx } from "../mb-compare-export";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// 다운로드되는 Blob 과 파일 이름을 가로챈다. createObjectURL 을 가짜로 바꾸는 이유는
// compare-export.test.ts 머리 주석 참조(vitest jsdom 호환 코드가 jsdom 30.1 과 안 맞음).
let createObjectURLSpy: MockInstance<typeof URL.createObjectURL>;
let revokeObjectURLSpy: MockInstance<typeof URL.revokeObjectURL>;
let clickSpy: MockInstance<HTMLAnchorElement["click"]>;
const downloadNames: string[] = [];

beforeEach(() => {
  downloadNames.length = 0;
  createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:roundtrip");
  revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloadNames.push(this.download);
    });
});

afterEach(() => {
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
  clickSpy.mockRestore();
});

/** 가로챈 Blob 을 exceljs 로 다시 열어 시트를 돌려준다 */
async function reopenDownloaded(sheetName: string) {
  expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
  expect(blob.type).toBe(XLSX_MIME);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const ws = wb.getWorksheet(sheetName);
  expect(ws).toBeDefined();
  return ws!;
}

/** 시트 전체를 [행][열] 문자열 표로 */
function sheetToTable(ws: ExcelJS.Worksheet): string[][] {
  const table: string[][] = [];
  ws.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1); // exceljs 는 1번 칸부터
    table.push(values.map((v) => String(v)));
  });
  return table;
}

describe("단지 비교 엑셀 — 실제 파일 왕복", () => {
  /** 정상 — 머리행(항목·단지명) + 행별 값이 그대로 들어가고 파일 이름·임시 URL 정리까지 */
  it("시트·머리행·셀 값이 화면 비교표와 같다", async () => {
    const complexes = [
      { complex_no: "1", complex_name: "가단지" },
      { complex_no: "2", complex_name: "나단지" },
    ] as Complex[];
    const rows = [
      { label: "단지명", render: (c: Complex) => c.complex_name },
      { label: "세대수", render: (c: Complex) => (c.complex_no === "1" ? "500" : "1,200") },
    ];
    await exportCompareToXlsx(complexes, rows);

    const ws = await reopenDownloaded("단지 비교");
    expect(sheetToTable(ws)).toEqual([
      ["항목", "가단지", "나단지"],
      ["단지명", "가단지", "나단지"],
      ["세대수", "500", "1,200"],
    ]);
    expect(downloadNames).toHaveLength(1);
    expect(downloadNames[0]).toMatch(/^단지비교_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:roundtrip");
  });

  /** 경계 — 수식처럼 시작하는 머리행·셀 값은 앞에 ' 가 붙어 수식으로 실행되지 않는다 */
  it("수식 인젝션 방어(') 가 파일의 머리행·셀에 남는다", async () => {
    const complexes = [{ complex_no: "1", complex_name: "=HYPERLINK(1)" }] as Complex[];
    const rows = [{ label: "연락처", render: () => "+82-2-000" }];
    await exportCompareToXlsx(complexes, rows);

    const ws = await reopenDownloaded("단지 비교");
    expect(sheetToTable(ws)).toEqual([
      ["항목", "'=HYPERLINK(1)"],
      ["연락처", "'+82-2-000"],
    ]);
  });
});

describe("미분양 비교 엑셀 — 실제 파일 왕복", () => {
  /** 정상 — 머리행 + 앞쪽 행들(단지명·지역·세대수) 값과 파일 이름 */
  it("시트·머리행·앞쪽 행 값이 맞다", async () => {
    const apt = {
      id: "A1",
      name: "미분양단지",
      region: "서울",
      gu: "강남구",
      units: 1500,
      unsold: 10,
      unsold_rate: 2.5,
    } as MbApartment;
    await exportMbCompareToXlsx([apt]);

    const ws = await reopenDownloaded("미분양 비교");
    const table = sheetToTable(ws);
    expect(table.slice(0, 6)).toEqual([
      ["항목", "미분양단지"],
      ["단지명", "미분양단지"],
      ["지역", "서울 강남구"],
      ["세대수", (1500).toLocaleString()],
      ["미분양", "10"],
      ["미분양률(%)", "2.5"],
    ]);
    expect(downloadNames[0]).toMatch(/^미분양비교_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
