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
  it("job_type 코드를 한글 라벨로 표시하고 코드명은 title(마우스 올리면)로만 보존", () => {
    render(
      <CrawlJobTable
        jobs={[
          mkJob({ id: 100, job_type: "complex_articles" }),
          mkJob({ id: 101, job_type: "price_history" }),
          mkJob({ id: 102, job_type: "public_trade_data" }),
        ]}
      />,
    );
    expect(screen.getByText("단지 매물 가져오기")).toBeInTheDocument();
    expect(screen.getByText("단지 시세 기록 모으기")).toBeInTheDocument();
    expect(screen.getByText("정부 실거래가 받기")).toBeInTheDocument();
    // 코드명은 본문 글자가 아니라 title 속성에만 있다 (원칙 3 — 개발자 원문은 마우스 올리면)
    expect(screen.queryByText("complex_articles")).not.toBeInTheDocument();
    expect(screen.getByText("단지 매물 가져오기")).toHaveAttribute("title", "complex_articles");
    expect(screen.getByText("단지 시세 기록 모으기")).toHaveAttribute("title", "price_history");
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

  it("미등록 job_type 은 코드명을 그대로 이름 자리에 표시 (fallback — 정보 손실 방지)", () => {
    render(<CrawlJobTable jobs={[mkJob({ id: 1, job_type: "future_unknown" })]} />);
    expect(screen.getByText("future_unknown")).toHaveAttribute("title", "future_unknown");
  });

  it("모르는 상태값은 영문 원문 대신 '알 수 없음' + title 에 원문", () => {
    render(<CrawlJobTable jobs={[mkJob({ id: 1, status: "zombie_state" })]} />);
    expect(screen.queryByText("zombie_state")).not.toBeInTheDocument();
    expect(screen.getByText("알 수 없음")).toHaveAttribute("title", "zombie_state");
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

  /** 실패 행에는 BE 가 준 우리말 한 줄(error_plain)을 보이고, 원문(error_message)은 title 로만 남긴다.
   *  옛 BE(필드 없음)·다른 상태에서는 줄을 그리지 않는다 */
  it("실패 행에 error_plain 우리말 한 줄 — 원문은 title, 없거나 실패가 아니면 안 그린다", () => {
    const raw = "공공데이터 오류 봉투 resultCode=04 (kaptCode=A1 searchDate=202608)";
    render(
      <CrawlJobTable
        jobs={[
          mkJob({ id: 1, status: "failed", error_message: raw, error_plain: "공공데이터 서버가 자료를 못 줬어요(사유 번호 04)" }),
          mkJob({ id: 2, status: "failed", error_message: "옛 백엔드 원문" }),
          mkJob({ id: 3, status: "cancelled", error_message: "stale running", error_plain: "취소 사유 문장" }),
        ]}
      />,
    );
    const line = screen.getByText("공공데이터 서버가 자료를 못 줬어요(사유 번호 04)");
    expect(line).toHaveAttribute("title", raw);
    // 원문은 본문 글자로 새지 않는다
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(screen.queryByText("옛 백엔드 원문")).not.toBeInTheDocument();
    expect(screen.queryByText("취소 사유 문장")).not.toBeInTheDocument();
  });
});
