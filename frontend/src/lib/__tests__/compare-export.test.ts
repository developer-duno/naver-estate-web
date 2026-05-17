/**
 * 비교 엑셀 내보내기 테스트 — buildCompareXlsx 헬퍼 + 에러 동작 회귀 가드
 * 실행: npx vitest run src/lib/__tests__/compare-export.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

// downloadXlsxBuffer 는 DOM(Blob/URL/anchor)을 건드리므로 stub.
// 본 파일은 같은 모듈(compare-export)을 테스트하므로 부분 mock.
vi.mock("../compare-export", async () => {
  const actual =
    await vi.importActual<typeof import("../compare-export")>("../compare-export");
  return { ...actual, downloadXlsxBuffer: vi.fn().mockResolvedValue(undefined) };
});

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
