/**
 * CrawlJobTable 테스트 — 한글 라벨 + 코드명 병기, 상태 한글화
 * 실행: npx vitest run src/components/admin/__tests__/CrawlJobTable.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CrawlJobTable from "../CrawlJobTable";
import type { CrawlJobDetail } from "@/types/admin";

function mkJob(overrides: Partial<CrawlJobDetail>): CrawlJobDetail {
  return {
    id: 1,
    job_type: "complex_articles",
    target_id: "12345",
    status: "completed",
    total_items: 5,
    processed_items: 5,
    error_message: undefined,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("CrawlJobTable", () => {
  it("job_type 코드를 한글 라벨로 표시하고 코드명을 회색으로 병기", () => {
    render(
      <CrawlJobTable
        jobs={[
          mkJob({ id: 100, job_type: "complex_articles" }),
          mkJob({ id: 101, job_type: "price_history" }),
          mkJob({ id: 102, job_type: "public_trade_data" }),
        ]}
      />,
    );
    expect(screen.getByText("단지 매물 수집")).toBeInTheDocument();
    expect(screen.getByText("시세 이력 수집")).toBeInTheDocument();
    expect(screen.getByText("공공 실거래가 수집")).toBeInTheDocument();
    // 코드명 병기 (회색 작은 글씨)
    expect(screen.getByText("complex_articles")).toBeInTheDocument();
    expect(screen.getByText("price_history")).toBeInTheDocument();
  });

  it("status 코드를 한글로 표시 (running → 실행 중, failed → 실패 등)", () => {
    render(
      <CrawlJobTable
        jobs={[
          mkJob({ id: 1, status: "running" }),
          mkJob({ id: 2, status: "failed" }),
          mkJob({ id: 3, status: "paused" }),
        ]}
      />,
    );
    expect(screen.getByText("실행 중")).toBeInTheDocument();
    expect(screen.getByText("실패")).toBeInTheDocument();
    expect(screen.getByText("일시정지")).toBeInTheDocument();
  });

  it("미등록 job_type 은 코드명 그대로 두 곳에 표시 (fallback)", () => {
    render(<CrawlJobTable jobs={[mkJob({ id: 1, job_type: "future_unknown" })]} />);
    // 한글 라벨 자리와 코드명 자리에 같은 문자열 노출됨
    const all = screen.getAllByText("future_unknown");
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("작업 0건이면 안내 메시지", () => {
    render(<CrawlJobTable jobs={[]} />);
    expect(screen.getByText(/작업이 없습니다/)).toBeInTheDocument();
  });

  // ── R3 문구 총정리 ──

  it("진행률에 '건' 단위가 붙는다 (숫자만 있으면 뭘 센 건지 모름)", () => {
    render(<CrawlJobTable jobs={[mkJob({ id: 1, processed_items: 480, total_items: 500 })]} />);
    expect(screen.getByText("480/500건")).toBeInTheDocument();
  });

  it("0/0건(그날 할 일 없음)도 단위와 함께 표시된다", () => {
    render(<CrawlJobTable jobs={[mkJob({ id: 1, processed_items: 0, total_items: 0 })]} />);
    expect(screen.getByText("0/0건")).toBeInTheDocument();
  });

  it("열 제목 'ID' 대신 '번호'", () => {
    render(<CrawlJobTable jobs={[]} />);
    expect(screen.getByRole("columnheader", { name: "번호" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "ID" })).not.toBeInTheDocument();
  });
});
