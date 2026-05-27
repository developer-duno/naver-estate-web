/** StatsCards 컴포넌트 테스트 — 채움률 3 상태 (null/undefined/0) 렌더 (PR 6a) */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsCards from "../StatsCards";
import type { DetailedStats } from "@/types/admin";

const baseStats: DetailedStats = {
  complex_count: 0,
  article_count: 0,
  active_article_count: 0,
  user_count: 0,
  today_crawl_count: 0,
  recent_crawl_jobs: [],
  error_count_24h: 0,
};

describe("StatsCards 채움률 row (PR 6a)", () => {
  it("null 필드 → '—' 표시 (BE 응답 명시 null 반환)", () => {
    const stats: DetailedStats = {
      ...baseStats,
      complex_detail_fill_rate: null,
      article_detail_fill_rate: null,
      complex_metric_fill_rate: null,
    };
    render(<StatsCards stats={stats} loading={false} />);
    expect(screen.getByText(/단지 상세: —/)).toBeInTheDocument();
    expect(screen.getByText(/매물 상세: —/)).toBeInTheDocument();
    expect(screen.getByText(/가치 지표: —/)).toBeInTheDocument();
  });

  it("undefined 필드 → '—' 표시 (BE 미배포 = 필드 부재)", () => {
    render(<StatsCards stats={baseStats} loading={false} />);
    expect(screen.getByText(/단지 상세: —/)).toBeInTheDocument();
    expect(screen.getByText(/매물 상세: —/)).toBeInTheDocument();
    expect(screen.getByText(/가치 지표: —/)).toBeInTheDocument();
  });

  it("0 필드 → '0.00%' 표시 (실제 0% 채움률, F9 답습)", () => {
    const stats: DetailedStats = {
      ...baseStats,
      complex_detail_fill_rate: 0,
      article_detail_fill_rate: 0,
      complex_metric_fill_rate: 0,
    };
    render(<StatsCards stats={stats} loading={false} />);
    expect(screen.getByText(/단지 상세: 0\.00%/)).toBeInTheDocument();
    expect(screen.getByText(/매물 상세: 0\.00%/)).toBeInTheDocument();
    expect(screen.getByText(/가치 지표: 0\.00%/)).toBeInTheDocument();
  });

  it("정상 채움률 (0.1023 → '10.23%') 표시", () => {
    const stats: DetailedStats = {
      ...baseStats,
      complex_detail_fill_rate: 0.1023,
      article_detail_fill_rate: 0.0405,
      complex_metric_fill_rate: 0.0102,
    };
    render(<StatsCards stats={stats} loading={false} />);
    expect(screen.getByText(/단지 상세: 10\.23%/)).toBeInTheDocument();
    expect(screen.getByText(/매물 상세: 4\.05%/)).toBeInTheDocument();
    expect(screen.getByText(/가치 지표: 1\.02%/)).toBeInTheDocument();
  });
});
