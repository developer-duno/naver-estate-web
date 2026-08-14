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
});
