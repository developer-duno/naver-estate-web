/**
 * FailureBreakdown 카드 테스트 — 유형별 실패 분포
 * 실행: npx vitest run src/components/admin/__tests__/FailureBreakdown.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import FailureBreakdown from "../FailureBreakdown";

vi.mock("@/lib/api", () => ({
  getAdminCrawlFailures: vi.fn(),
}));

import { getAdminCrawlFailures } from "@/lib/api";
const mockGet = vi.mocked(getAdminCrawlFailures);

function renderCard(onJumpToFailed?: (jobType?: string) => void) {
  return render(
    <TestQueryProvider>
      <FailureBreakdown token="test-token" onJumpToFailed={onJumpToFailed} />
    </TestQueryProvider>,
  );
}

describe("FailureBreakdown", () => {
  it("휴대폰(마우스 없음)에서도 '원문 보기'를 누르면 작업 코드·오류 원문이 펼쳐지고, 유형 이동은 일어나지 않는다", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 3,
      items: [
        {
          job_type: "complex_articles",
          count: 3,
          last_error: "네이버 API 차단",
          last_failed_at: new Date().toISOString(),
        },
      ],
    });
    const onJump = vi.fn();
    renderCard(onJump);
    const toggle = await screen.findByText("원문 보기");
    // 버튼(유형 이동) 안에 누를 거리를 두지 않는다 — 인터랙티브 요소 중첩 금지
    expect(toggle.closest("button")).toBeNull();
    expect(screen.queryByText(/오류 원문: 네이버 API 차단/)).toBeNull();

    fireEvent.click(toggle);
    const raw = screen.getByText(/오류 원문: 네이버 API 차단/);
    expect(raw).toHaveTextContent("작업 코드: complex_articles");
    expect(onJump).not.toHaveBeenCalled();
  });

  it("실패 0건이면 모두 정상 메시지 표시", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 0,
      items: [],
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/모두 정상이에요/)).toBeInTheDocument();
    });
  });

  it("유형별 카운트 + 한글 라벨 표시, 코드명·오류 원문은 본문이 아니라 title 로만", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 4,
      items: [
        {
          job_type: "complex_articles",
          count: 3,
          last_error: "네이버 API 차단",
          last_failed_at: new Date(Date.now() - 600_000).toISOString(),
        },
        {
          job_type: "price_history",
          count: 1,
          last_error: "DB 락 타임아웃",
          last_failed_at: new Date().toISOString(),
        },
      ],
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("단지 매물 가져오기")).toBeInTheDocument();
    });
    expect(screen.getByText("단지 시세 기록 모으기")).toBeInTheDocument();
    expect(screen.getByText("3건")).toBeInTheDocument();
    expect(screen.getByText("1건")).toBeInTheDocument();
    // 코드명은 본문에 없고 라벨의 title 로만 (세션 419 원칙 3)
    expect(screen.queryByText("complex_articles")).toBeNull();
    expect(screen.getByText("단지 매물 가져오기")).toHaveAttribute("title", "complex_articles");
    // 오류 원문은 본문에 없고, 번역이 없으면 고정 안내 문구 + title 원문
    expect(screen.queryByText(/네이버 API 차단/)).toBeNull();
    const notes = screen.getAllByText(/최근 오류 기록 있음/);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveAttribute("title", "네이버 API 차단");
    // 카드 헤더에 총합
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("총 4건");
  });

  /** BE 가 last_error_plain 을 주면 그것을 본문에, 원문은 title 로. 빈 문자열이면 고정 문구로 폴백 */
  it("last_error_plain 이 있으면 우리말을, 없거나 빈 문자열이면 고정 안내 문구를 보인다", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 3,
      items: [
        {
          job_type: "complex_articles",
          count: 2,
          last_error: "HTTPError 403 Forbidden",
          last_error_plain: "네이버가 잠시 막았어요",
          last_failed_at: null,
        },
        {
          job_type: "price_history",
          count: 1,
          last_error: "psycopg2.OperationalError",
          last_error_plain: "",
          last_failed_at: null,
        },
      ],
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("최근 오류: 네이버가 잠시 막았어요")).toBeInTheDocument();
    });
    expect(screen.getByText("최근 오류: 네이버가 잠시 막았어요")).toHaveAttribute(
      "title",
      "HTTPError 403 Forbidden",
    );
    // 빈 문자열 번역 → 영어 원문이 아니라 고정 문구
    expect(screen.queryByText(/psycopg2/)).toBeNull();
    expect(screen.getByText(/최근 오류 기록 있음/)).toHaveAttribute("title", "psycopg2.OperationalError");
  });

  it("행 클릭 시 onJumpToFailed(jobType) 콜백 호출", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 2,
      items: [
        { job_type: "complex_articles", count: 2, last_error: null, last_failed_at: null },
      ],
    });
    const spy = vi.fn();
    renderCard(spy);
    await waitFor(() => {
      expect(screen.getByText("단지 매물 가져오기")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /단지 매물 가져오기/ }));
    expect(spy).toHaveBeenCalledWith("complex_articles");
  });

  it("로딩 중에는 회색 placeholder 표시", () => {
    mockGet.mockImplementation(() => new Promise(() => { /* never */ }));
    const { container } = renderCard();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
