/**
 * 비교 엑셀 내보내기 테스트 — buildCompareXlsx 헬퍼 + 에러 동작 회귀 가드
 * 실행: npx vitest run src/lib/__tests__/compare-export.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import type { Complex, MbApartment } from "@/types";

const mockAddRow = vi.fn();
const mockWriteBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
const mockAddWorksheet = vi.fn(() => ({
  columns: [] as unknown[],
  addRow: mockAddRow,
}));

vi.mock("exceljs", () => {
  class Workbook {
    addWorksheet = mockAddWorksheet;
    xlsx = { writeBuffer: mockWriteBuffer };
  }
  return { default: { Workbook } };
});

// 다운로드 단계(downloadXlsxBuffer)는 같은 모듈 안에서 직접 호출되므로 모듈 부분 mock 으로는
// 가로챌 수 없다(예전 부분 mock 은 실제로는 아무것도 막지 못했다). 그래서 브라우저 경계인
// URL.createObjectURL / revokeObjectURL 을 가짜로 바꾼다.
// ⚠ vitest 5 의 jsdom 환경은 URL.createObjectURL 을 jsdom Blob 내부 슬롯을 읽는 호환 코드로
// 감싸는데, jsdom 30.1 부터 그 슬롯을 못 찾아 "reading '_buffer'" 로 죽는다(테스트 환경 전용 —
// 실제 브라우저는 무관). 가짜로 바꾸면 그 호환 코드를 거치지 않는다.
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FAKE_URL = "blob:compare-export-test";
let createObjectURLSpy: MockInstance<typeof URL.createObjectURL>;
let revokeObjectURLSpy: MockInstance<typeof URL.revokeObjectURL>;

beforeEach(() => {
  createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue(FAKE_URL);
  revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
});

/** 다운로드 단계가 xlsx 형식 Blob 으로 한 번 실행되고 임시 URL 을 정리했는지 */
function expectDownloadedOnce() {
  expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe(XLSX_MIME);
  expect(revokeObjectURLSpy).toHaveBeenCalledWith(FAKE_URL);
}

function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return { complex_no: "1", complex_name: "테스트단지", ...overrides } as Complex;
}

function makeApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "A1",
    name: "미분양단지",
    region: "서울",
    gu: "강남구",
    units: 500,
    unsold: 10,
    unsold_rate: 2.0,
    ...overrides,
  } as MbApartment;
}

describe("exportCompareToXlsx (단지 비교)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  /** 정상 케이스 — 워크북·시트·행 생성 */
  it("단지 비교 엑셀 버퍼를 생성한다", async () => {
    const { exportCompareToXlsx } = await import("../compare-export");
    const rows = [{ label: "단지명", render: (c: Complex) => c.complex_name }];
    await exportCompareToXlsx([makeComplex()], rows);
    expect(mockAddWorksheet).toHaveBeenCalledWith("단지 비교");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
    expect(mockAddRow).toHaveBeenCalledTimes(1);
    expectDownloadedOnce();
  });

  /** 에러 케이스 — 실패 시 "엑셀 생성 실패:" 프리픽스로 래핑 throw */
  it("내부 실패 시 '엑셀 생성 실패:' 프리픽스로 throw 한다", async () => {
    mockWriteBuffer.mockRejectedValueOnce(new Error("buffer 실패"));
    const { exportCompareToXlsx } = await import("../compare-export");
    await expect(
      exportCompareToXlsx([makeComplex()], [{ label: "x", render: () => "" }]),
    ).rejects.toThrow(/^엑셀 생성 실패: buffer 실패$/);
  });
});

describe("exportMbCompareToXlsx (미분양 비교)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  /** 정상 케이스 — 워크북·시트 생성 */
  it("미분양 비교 엑셀 버퍼를 생성한다", async () => {
    const { exportMbCompareToXlsx } = await import("../mb-compare-export");
    await exportMbCompareToXlsx([makeApt()]);
    expect(mockAddWorksheet).toHaveBeenCalledWith("미분양 비교");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
    expectDownloadedOnce();
  });

  /** 에러 케이스 — 래핑 없이 원본 에러를 그대로 throw (compare 와 동작 다름) */
  it("내부 실패 시 원본 에러를 그대로 throw 한다", async () => {
    mockWriteBuffer.mockRejectedValueOnce(new Error("원본 에러"));
    const { exportMbCompareToXlsx } = await import("../mb-compare-export");
    await expect(exportMbCompareToXlsx([makeApt()])).rejects.toThrow(
      /^원본 에러$/,
    );
  });
});
