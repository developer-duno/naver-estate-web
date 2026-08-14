/**
 * CollectorTrigger 컴포넌트 테스트 — 관리자 수집 트리거 버튼
 * 실행: npx vitest run src/components/__tests__/CollectorTrigger.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import CollectorTrigger from "../admin/CollectorTrigger";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  triggerCollection: vi.fn(),
}));

import { triggerCollection } from "@/lib/api";
const mockTrigger = vi.mocked(triggerCollection);

const getToken = vi.fn().mockResolvedValue("test-token");

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <CollectorTrigger getToken={getToken} />
    </TestQueryProvider>,
  );
}

describe("CollectorTrigger 컴포넌트", () => {
  /** 4개 수집기 버튼이 렌더되는지 */
  it("4개 수집기 버튼이 모두 렌더된다", () => {
    renderWithProvider();
    expect(screen.getByText("범죄통계")).toBeInTheDocument();
    expect(screen.getByText("대기질")).toBeInTheDocument();
    expect(screen.getByText("응급의료")).toBeInTheDocument();
    expect(screen.getByText("어린이집")).toBeInTheDocument();
  });

  /** 제목이 표시되는지 */
  it("제목이 표시된다", () => {
    renderWithProvider();
    expect(screen.getByText("외부 데이터 지금 받아오기")).toBeInTheDocument();
  });

  /** 클릭 시 API 호출 */
  it("버튼 클릭 시 triggerCollection을 호출한다", async () => {
    mockTrigger.mockResolvedValueOnce({ status: "completed", collector: "crime-stats" });
    renderWithProvider();

    fireEvent.click(screen.getByText("범죄통계"));

    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith("test-token", "crime-stats");
    });
  });

  /** 성공 시 완료 표시 */
  it("수집 성공 시 '수집 완료' 텍스트가 표시된다", async () => {
    mockTrigger.mockResolvedValueOnce({ status: "completed", collector: "air-quality" });
    renderWithProvider();

    fireEvent.click(screen.getByText("대기질"));

    await waitFor(() => {
      expect(screen.getByText("수집 완료")).toBeInTheDocument();
    });
  });

  /** 실패 시 에러 메시지 표시 */
  it("수집 실패 시 에러 메시지가 표시된다", async () => {
    mockTrigger.mockRejectedValueOnce(new Error("수집 실패: timeout"));
    renderWithProvider();

    fireEvent.click(screen.getByText("응급의료"));

    await waitFor(() => {
      expect(screen.getByText("수집 실패: timeout")).toBeInTheDocument();
    });
  });

  /** 세션 362 회귀 가드: 쿼터 소진 시 "수집 완료"로 오해하지 않도록 별도 경고 표시 */
  it("backfill-price 가 쿼터 소진으로 조기 종료되면 경고 메시지가 표시된다", async () => {
    mockTrigger.mockResolvedValueOnce({
      status: "completed", collector: "backfill-price",
      quota_exhausted: true, success: 3, failed: 0, total: 20,
    });
    renderWithProvider();

    fireEvent.click(screen.getByText("실거래가 소급"));

    await waitFor(() => {
      expect(screen.getByText("하루 호출 한도를 다 써서 중단 (3/20건)")).toBeInTheDocument();
    });
    expect(screen.queryByText("수집 완료")).not.toBeInTheDocument();
  });
});
