/**
 * NaverCallsCard 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/NaverCallsCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import NaverCallsCard from "../NaverCallsCard";

vi.mock("@/lib/api", () => ({
  getAdminNaverCalls: vi.fn(),
}));

import { getAdminNaverCalls } from "@/lib/api";
const mockGet = vi.mocked(getAdminNaverCalls);

const getToken = vi.fn().mockResolvedValue("test-token");

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <NaverCallsCard getToken={getToken} />
    </TestQueryProvider>,
  );
}

describe("NaverCallsCard 컴포넌트", () => {
  it("제목과 테이블 헤더가 렌더된다", async () => {
    mockGet.mockResolvedValueOnce({
      labels: {},
      totals: { "10m": 0, "1h": 0, "24h": 0 },
    });
    renderWithProvider();
    expect(screen.getByText("네이버 API 호출 계측")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("아직 집계된 호출이 없습니다")).toBeInTheDocument();
    });
    expect(screen.getByText("10분")).toBeInTheDocument();
    expect(screen.getByText("1시간")).toBeInTheDocument();
    expect(screen.getByText("24시간")).toBeInTheDocument();
  });

  it("라벨을 한글 이름과 숫자로 표시하고 24h 내림차순 정렬", async () => {
    mockGet.mockResolvedValueOnce({
      labels: {
        search: { "10m": 5, "1h": 20, "24h": 100 },
        crawl_articles_batch: { "10m": 0, "1h": 30, "24h": 500 },
        article_detail_live: { "10m": 2, "1h": 10, "24h": 50 },
      },
      totals: { "10m": 7, "1h": 60, "24h": 650 },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("검색")).toBeInTheDocument();
    });
    expect(screen.getByText("매물 목록 (배치)")).toBeInTheDocument();
    expect(screen.getByText("매물 상세 (실시간)")).toBeInTheDocument();

    // 24h 합계 650 이 tfoot 에 표시
    expect(screen.getByText("650")).toBeInTheDocument();

    // 정렬 검증: 첫 tbody 행이 24h 가장 큰 crawl_articles_batch(500)
    const rows = screen.getAllByRole("row");
    // [thead, batch(500), search(100), detail(50), tfoot]
    expect(rows[1]).toHaveTextContent("매물 목록 (배치)");
    expect(rows[2]).toHaveTextContent("검색");
    expect(rows[3]).toHaveTextContent("매물 상세 (실시간)");
  });

  it("알 수 없는 라벨은 '기타' 그룹 + 원본 라벨 그대로 표시", async () => {
    mockGet.mockResolvedValueOnce({
      labels: {
        unknown_new_label: { "10m": 1, "1h": 2, "24h": 3 },
      },
      totals: { "10m": 1, "1h": 2, "24h": 3 },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("unknown_new_label")).toBeInTheDocument();
    });
    expect(screen.getByText("기타")).toBeInTheDocument();
  });

  it("API 에러 시 에러 메시지 표시", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProvider();
    await waitFor(() => {
      expect(
        screen.getByText(/호출 통계를 불러오지 못했습니다.*network down/),
      ).toBeInTheDocument();
    });
  });
});
