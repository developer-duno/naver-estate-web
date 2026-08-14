/**
 * /admin/scheduler-calendar 페이지 문구 회귀 가드 (R3 적대리뷰 Med⑥)
 * 실행: npx vitest run src/app/admin/scheduler-calendar/__tests__/page.test.tsx
 *
 * 이 페이지의 카드 제목·도움말은 지금까지 어떤 테스트도 덮지 않았다.
 * "발화"(APScheduler 내부 용어) 가 화면에 다시 새는 것을 막고,
 * 카드 제목이 사람이 읽는 "2026년 8월 실행 일정" 형태인지 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { SchedulerCalendarResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getSchedulerCalendar: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

// FullCalendar 는 jsdom 에서 DOM 측정 의존이라 stub (SchedulerCalendarView 테스트와 동일 전략)
vi.mock("@fullcalendar/react", () => ({
  default: () => <div data-testid="fc-stub" />,
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ko", () => ({ default: { code: "ko" } }));

import { getSchedulerCalendar } from "@/lib/api";
import SchedulerCalendarPage from "../page";

const mockCalendar = vi.mocked(getSchedulerCalendar);

const emptyResponse: SchedulerCalendarResponse = {
  year: 2026,
  month: 8,
  mode: "both",
  events: [],
  truncated: false,
};

function renderPage() {
  return render(
    <TestQueryProvider>
      <SchedulerCalendarPage />
    </TestQueryProvider>,
  );
}

describe("/admin/scheduler-calendar 페이지 문구", () => {
  beforeEach(() => {
    // 카드 제목이 "오늘" 기준 연·월이라 시계를 고정해 단언을 결정론적으로 만든다.
    // ⚠ useFakeTimers() 는 waitFor 가 쓰는 타이머까지 멈춰 테스트가 timeout 난다 —
    // Date 만 고정(toFake)해 React Query 의 비동기 흐름은 실제 타이머로 돌게 둔다.
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 14, 10, 0, 0)); // 2026-08-14 (로컬)
    mockCalendar.mockResolvedValue(emptyResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("카드 제목이 '2026년 8월 실행 일정' 형식", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("2026년 8월 실행 일정")).toBeInTheDocument();
    });
  });

  it("화면 어디에도 '발화' 라는 내부 용어가 없다", async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText("2026년 8월 실행 일정")).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain("발화");
    // 대체 표현("실행")은 살아 있어야 한다 — 문구가 통째로 사라진 것과 구분
    expect(container.textContent).toContain("실행");
  });
});
