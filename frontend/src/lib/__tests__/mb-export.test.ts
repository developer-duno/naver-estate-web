/**
 * 미분양 엑셀 내보내기 테스트 — vi.mock("exceljs")로 버퍼 생성 검증
 * 실행: npx vitest run src/lib/__tests__/mb-export.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

// downloadXlsxBuffer는 DOM을 건드리므로 stub (compare-export에서 재export)
vi.mock("../compare-export", async () => {
  const actual = await vi.importActual<typeof import("../compare-export")>("../compare-export");
  return {
    ...actual,
    downloadXlsxBuffer: vi.fn().mockResolvedValue(undefined),
  };
});

function makeApt(overrides = {}) {
  return { id: "A1", name: "테스트단지", region: "서울", gu: "강남구", units: 500, unsold: 10, unsold_rate: 2.0, ...overrides };
}

function makeRegion(overrides = {}) {
  return { id: 1, region: "서울", gu: "강남구", population: 500000, households: 200000, ...overrides };
}

function makeTrade(overrides = {}) {
  return { id: 1, region: "서울", gu: "강남구", apt_name: "래미안", deal_month: "202603", price: 80000, area: 84.5, ...overrides };
}

function makeHistory(overrides = {}) {
  return { id: 1, apartment_id: "A1", base_month: "2026-03", unsold_count: 10, post_completion_unsold: 3, change: -2, ...overrides };
}

describe("미분양 엑셀 내보내기 (mb-export)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  /** 아파트 목록 export 시 addWorksheet + writeBuffer 호출 확인 */
  it("exportMbApartmentsToXlsx가 엑셀 버퍼를 생성한다", async () => {
    const { exportMbApartmentsToXlsx } = await import("../mb-export");
    await exportMbApartmentsToXlsx([makeApt()]);
    expect(mockAddWorksheet).toHaveBeenCalledWith("미분양단지");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
    expect(mockAddRow).toHaveBeenCalledTimes(1);
  });

  /** 빈 배열 입력 시에도 정상 동작 — 헤더만 있는 시트 생성 */
  it("빈 배열을 전달해도 에러 없이 실행된다", async () => {
    const { exportMbApartmentsToXlsx } = await import("../mb-export");
    await expect(exportMbApartmentsToXlsx([])).resolves.toBeUndefined();
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
    expect(mockAddRow).not.toHaveBeenCalled();
  });

  /** 지역 통계 export */
  it("exportMbRegionsToXlsx가 엑셀 버퍼를 생성한다", async () => {
    const { exportMbRegionsToXlsx } = await import("../mb-export");
    await exportMbRegionsToXlsx([makeRegion()]);
    expect(mockAddWorksheet).toHaveBeenCalledWith("지역통계");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
  });

  /** 실거래 export */
  it("exportMbTradesToXlsx가 엑셀 버퍼를 생성한다", async () => {
    const { exportMbTradesToXlsx } = await import("../mb-export");
    await exportMbTradesToXlsx([makeTrade()]);
    expect(mockAddWorksheet).toHaveBeenCalledWith("실거래");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
  });

  /** 미분양 추이 export */
  it("exportMbUnsoldHistoryToXlsx가 엑셀 버퍼를 생성한다", async () => {
    const { exportMbUnsoldHistoryToXlsx } = await import("../mb-export");
    await exportMbUnsoldHistoryToXlsx([makeHistory()], "래미안");
    expect(mockAddWorksheet).toHaveBeenCalledWith("미분양추이");
    expect(mockWriteBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("safeCellValue 수식 인젝션 방어", () => {
  it("= + @ - 시작 문자열에 접두어를 추가한다", async () => {
    const { safeCellValue } = await import("../compare-export");
    expect(safeCellValue("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCellValue("+cmd")).toBe("'+cmd");
    expect(safeCellValue("@evil")).toBe("'@evil");
    expect(safeCellValue("-calc")).toBe("'-calc");
  });

  it("일반 문자열은 그대로 반환한다", async () => {
    const { safeCellValue } = await import("../compare-export");
    expect(safeCellValue("정상 텍스트")).toBe("정상 텍스트");
    expect(safeCellValue("12345")).toBe("12345");
  });

  it("빈 문자열/null-like 입력 시 빈 문자열 반환", async () => {
    const { safeCellValue } = await import("../compare-export");
    expect(safeCellValue("")).toBe("");
  });
});
