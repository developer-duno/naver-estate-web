/**
 * DataFreshnessCard 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/DataFreshnessCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import DataFreshnessCard from "../DataFreshnessCard";
import type { DataFreshnessResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getDataFreshness: vi.fn(),
}));

import { getDataFreshness } from "@/lib/api";
const mockGet = vi.mocked(getDataFreshness);

function renderCard(token = "test-token") {
  return render(
    <TestQueryProvider>
      <DataFreshnessCard token={token} />
    </TestQueryProvider>,
  );
}

const baseItem = (overrides: Partial<DataFreshnessResponse["items"][number]> = {}) => ({
  key: "x",
  label: "x",
  count: 0,
  last_updated: null,
  expected_interval_seconds: 86400,
  status: "green" as const,
  spinning: false,
  last_job: null,
  new_rows: null,
  ...overrides,
});

const baseFixture = (): DataFreshnessResponse => {
  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  return {
    generated_at: now.toISOString(),
    items: [
      baseItem({ key: "complexes", label: "단지", count: 63360, last_updated: ago(60 * 60 * 1000), expected_interval_seconds: 604800, status: "green", new_rows: 12 }),
      baseItem({ key: "articles", label: "매물", count: 620635, last_updated: ago(30 * 60 * 1000), expected_interval_seconds: 43200, status: "green", new_rows: 245, last_job: { started_at: ago(40 * 60 * 1000), completed_at: ago(20 * 60 * 1000), processed_items: 50, total_items: 50 } }),
      baseItem({ key: "complex_price_history", label: "시세 이력", count: 1200000, last_updated: ago(3 * 86400 * 1000), expected_interval_seconds: 604800, status: "green", new_rows: 1500 }),
      baseItem({ key: "unsold", label: "미분양 이력", count: 8432, last_updated: ago(50 * 86400 * 1000), expected_interval_seconds: 2592000, status: "yellow" }),
      baseItem({ key: "air_quality", label: "대기질", count: 100, last_updated: ago(40 * 60 * 1000), expected_interval_seconds: 86400, status: "green", last_job: { started_at: ago(45 * 60 * 1000), completed_at: ago(40 * 60 * 1000), processed_items: 100, total_items: 100 } }),
      baseItem({ key: "childcare", label: "어린이집", count: 0, last_updated: null, expected_interval_seconds: 2592000, status: "unknown" }),
      baseItem({ key: "crime_stats", label: "범죄통계", count: 2001, last_updated: ago(300 * 86400 * 1000), expected_interval_seconds: 7776000, status: "red" }),
      baseItem({ key: "public_trades", label: "공공데이터 실거래가", count: 173964, last_updated: ago(86400 * 1000), expected_interval_seconds: 604800, status: "green" }),
    ],
  };
};

describe("DataFreshnessCard 컴포넌트", () => {
  it("제목과 8개 종목 라벨이 모두 렌더된다", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    expect(screen.getByText("데이터 신선도")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("단지")).toBeInTheDocument();
    });
    for (const label of ["매물", "시세 이력", "미분양 이력", "대기질", "어린이집", "범죄통계", "공공데이터 실거래가"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("count 는 천단위 콤마로 표시된다", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("63,360")).toBeInTheDocument();
    });
    expect(screen.getByText("620,635")).toBeInTheDocument();
    expect(screen.getByText("173,964")).toBeInTheDocument();
  });

  it("status 별 dot 색이 매핑된다 (green/yellow/red/unknown)", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    const { container } = renderCard();
    await waitFor(() => {
      expect(screen.getByText("단지")).toBeInTheDocument();
    });
    const dots = container.querySelectorAll('[aria-label]');
    const classes = Array.from(dots).map((d) => d.className);
    // green/yellow/red/unknown 각각 최소 1개 존재
    expect(classes.some((c) => c.includes("bg-green-500"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-yellow-400"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-red-500"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-gray-300"))).toBe(true);
  });

  it("last_updated=null 이면 '미수집' 표시", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("어린이집")).toBeInTheDocument();
    });
    // "갱신 미수집" 라벨 (어린이집은 last_updated=null 이라 '갱신 미수집' 출력)
    expect(screen.getAllByText(/미수집/).length).toBeGreaterThanOrEqual(1);
  });

  it("API 에러 시 에러 메시지 표시", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/불러오기 실패.*network down/)).toBeInTheDocument();
    });
  });

  it("토큰이 빈 문자열이면 fetch 실행하지 않음", async () => {
    mockGet.mockClear();
    mockGet.mockResolvedValue(baseFixture());
    renderCard("");
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("spinning=true 인 종목에 '헛바퀴 의심' 뱃지 표시", async () => {
    const fx = baseFixture();
    // 어린이집을 헛바퀴 시나리오로 교체
    fx.items[5] = {
      ...fx.items[5],
      status: "red",
      spinning: true,
      last_updated: new Date().toISOString(),
      last_job: {
        started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        completed_at: new Date(Date.now() - 8 * 60_000).toISOString(),
        processed_items: 0,
        total_items: 100,
      },
    };
    mockGet.mockClear();
    mockGet.mockResolvedValueOnce(fx);
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("어린이집")).toBeInTheDocument();
    });
    expect(screen.getByText("헛바퀴 의심")).toBeInTheDocument();
    // 처리 0/100 표시
    expect(screen.getByText(/처리 0\/100/)).toBeInTheDocument();
  });

  it("new_rows=0 이면 빨간 강조 텍스트로 '신규 0건' 표시", async () => {
    const fx = baseFixture();
    // 매물에 작업은 돌았는데 new_rows=0
    fx.items[1] = {
      ...fx.items[1],
      status: "red",
      spinning: true,
      new_rows: 0,
      last_job: {
        started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        completed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        processed_items: 10,
        total_items: 10,
      },
    };
    mockGet.mockClear();
    mockGet.mockResolvedValueOnce(fx);
    const { container } = renderCard();
    await waitFor(() => {
      expect(screen.getByText("매물")).toBeInTheDocument();
    });
    const newRowsText = screen.getByText("신규 0건");
    expect(newRowsText.className).toContain("text-red-600");
    // 헛바퀴 뱃지도 매물 줄에 떠야 함
    expect(container.textContent).toContain("헛바퀴 의심");
  });

  it("last_job=null 종목은 '정기 작업 없음' 표시", async () => {
    mockGet.mockClear();
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("미분양 이력")).toBeInTheDocument();
    });
    // 미분양/시세이력/공공실거래/단지/범죄통계 등 last_job=null 인 종목들 ≥ 1
    expect(screen.getAllByText("정기 작업 없음").length).toBeGreaterThanOrEqual(1);
  });
});
