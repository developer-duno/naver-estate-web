/**
 * BulkRecrawlCard 회귀 가드 — 실행 성공 문구 한글화 (PR-R1)
 * 실행: npx vitest run src/components/admin/__tests__/BulkRecrawlCard.test.tsx
 *
 * BE 는 status 에 "started" 리터럴을 고정 반환한다 (routers/admin/recrawl.py).
 * 그 영문 코드를 그대로 노출하는 대신 "시작됨 — 한 번에 N개 단지" 로 무엇이 일어났는지 알린다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import BulkRecrawlCard from "../BulkRecrawlCard";
import type { RecrawlProgress, RecrawlStatus } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getRecrawlStatus: vi.fn(),
  getRecrawlProgress: vi.fn(),
  runRecrawlArticles: vi.fn(),
}));

import { getRecrawlStatus, getRecrawlProgress, runRecrawlArticles } from "@/lib/api";

const mockStatus = vi.mocked(getRecrawlStatus);
const mockProgress = vi.mocked(getRecrawlProgress);
const mockRun = vi.mocked(runRecrawlArticles);

const safeStatus = (overrides: Partial<RecrawlStatus> = {}): RecrawlStatus =>
  ({
    level: "safe",
    recrawl_in_progress: false,
    estimated_seconds_per_100: 300,
    recommended_window_kst: "02:00~05:00",
    ...overrides,
  }) as RecrawlStatus;

function renderCard() {
  return render(
    <TestQueryProvider>
      <BulkRecrawlCard getToken={async () => "test-token"} />
    </TestQueryProvider>,
  );
}

describe("BulkRecrawlCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.mockResolvedValue(safeStatus());
    mockProgress.mockResolvedValue({ job: null } as RecrawlProgress);
  });

  /** 정상: 실행 성공 시 영문 status 대신 한글 문구 + 배치 크기를 사람말로 */
  it("실행 성공 시 '시작됨 — 한 번에 N개 단지' 한글 문구를 보여준다", async () => {
    mockRun.mockResolvedValue({ status: "started", batch_size: 100 } as Awaited<
      ReturnType<typeof runRecrawlArticles>
    >);
    renderCard();

    // statusQuery 가 로딩 중이면 버튼이 disabled 라 클릭이 무시된다 — 활성화까지 대기
    const runBtn = await screen.findByRole("button", { name: "지금 실행" });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/시작됨 — 한 번에 100개 단지/)).toBeInTheDocument();
    });
    // 영문 원문(started)·개발자 용어(batch_size)가 화면에 남으면 안 된다
    expect(screen.queryByText(/started/)).not.toBeInTheDocument();
    expect(screen.queryByText(/batch_size/)).not.toBeInTheDocument();
  });

  /** 에러: 실행 실패 시 성공 문구 없이 에러 메시지만 */
  it("실행 실패 시 성공 문구 없이 에러 메시지를 보여준다", async () => {
    mockRun.mockRejectedValue(new Error("서버가 응답하지 않습니다"));
    renderCard();

    // statusQuery 가 로딩 중이면 버튼이 disabled 라 클릭이 무시된다 — 활성화까지 대기
    const runBtn = await screen.findByRole("button", { name: "지금 실행" });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText("서버가 응답하지 않습니다")).toBeInTheDocument();
    });
    expect(screen.queryByText(/시작됨/)).not.toBeInTheDocument();
  });

  /** 진행률 카드의 에러 줄 — 쉬운 우리말을 보여주고 원문은 title 로 (세션 411) */
  it("진행률 에러에 우리말이 보이고 원문은 title 에 남는다", async () => {
    const raw =
      "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout";
    const plain = "데이터베이스가 너무 오래 걸려 스스로 멈췄어요.";
    mockProgress.mockResolvedValue({
      job: {
        id: 1,
        status: "failed",
        total_items: 50,
        processed_items: 13,
        started_at: null,
        completed_at: null,
        error_message: raw,
        error_plain: plain,
      },
    } as RecrawlProgress);
    renderCard();

    await waitFor(() => {
      expect(screen.getByText(plain)).toBeInTheDocument();
    });
    // 개발자 에러 원문은 화면 글자로 보이지 않고, 추적용으로 title 에만 남는다
    expect(screen.queryByText(raw)).toBeNull();
    expect(screen.getByText(plain).getAttribute("title")).toBe(raw);
  });
});
