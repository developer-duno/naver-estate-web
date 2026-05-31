/**
 * SchedulerCalendarView 컴포넌트 테스트.
 * 실행: npx vitest run src/components/admin/__tests__/SchedulerCalendarView.test.tsx
 *
 * FullCalendar 는 jsdom 에서 ResizeObserver / DOM 측정 의존이라 실 렌더 어려움.
 * → @fullcalendar/react 를 stub 해 props 전달과 토글·상세 로직만 검증.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SchedulerCalendarEvent } from "@/types/admin";

// FullCalendar 컴포넌트 자체를 stub — 호출된 props 만 노출
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    const events = (props.events ?? []) as Array<{ title: string; order?: number }>;
    return (
      <div data-testid="fc-stub">
        <span data-testid="fc-event-count">{events.length}</span>
        <span data-testid="fc-event-order">{props.eventOrder as string}</span>
        {events.map((e, i) => (
          <span key={i} data-testid={`fc-event-${i}`} data-order={e.order}>
            {e.title}
          </span>
        ))}
      </div>
    );
  },
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ko", () => ({ default: { code: "ko" } }));

import SchedulerCalendarView from "../SchedulerCalendarView";

const sampleEvents: SchedulerCalendarEvent[] = [
  {
    scheduler_job_id: "collect_air_quality",
    name: "에어코리아 대기질",
    start: "2026-05-15T12:00:00+09:00",
    status: "completed",
    kind: "past",
  },
  {
    scheduler_job_id: "crawl_details",
    name: "매물 상세 보강",
    start: "2026-05-15T12:30:00+09:00",
    status: "failed",
    kind: "past",
  },
  {
    scheduler_job_id: "collect_metrics",
    name: "단지 가치지표 수집",
    start: "2026-05-25T04:30:00+09:00",
    status: "upcoming",
    kind: "upcoming",
  },
];

describe("SchedulerCalendarView", () => {
  /** 이벤트가 FullCalendar 에 그대로 전달된다 */
  it("이벤트가 FullCalendar 에 전달된다", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(screen.getByTestId("fc-event-count").textContent).toBe("3");
    expect(screen.getByTestId("fc-event-0").textContent).toBe("에어코리아 대기질");
  });

  /** 모드 토글 버튼 클릭 시 onModeChange 호출 */
  it("모드 토글 클릭 시 onModeChange 호출", () => {
    const onModeChange = vi.fn();
    render(
      <SchedulerCalendarView
        events={[]}
        mode="both"
        onModeChange={onModeChange}
        yearMonth="2026-05"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "과거만" }));
    expect(onModeChange).toHaveBeenCalledWith("past");
    fireEvent.click(screen.getByRole("button", { name: "예정만" }));
    expect(onModeChange).toHaveBeenCalledWith("upcoming");
  });

  /** 빈 이벤트 + truncated false 일 때 "총 0개 발화" */
  it("빈 이벤트도 안전하게 렌더된다", () => {
    render(
      <SchedulerCalendarView
        events={[]}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(screen.getByText(/총 0개 발화/)).toBeInTheDocument();
    expect(screen.queryByText(/잘림/)).not.toBeInTheDocument();
  });

  /** truncated=true 면 잘림 안내 */
  it("truncated 일 때 잘림 안내 표시", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
        truncated
      />,
    );
    expect(screen.getByText(/50,000개에서 잘림/)).toBeInTheDocument();
  });

  /** 모드 토글의 aria-pressed 가 현재 모드와 일치 */
  it("선택된 모드의 aria-pressed 가 true", () => {
    render(
      <SchedulerCalendarView
        events={[]}
        mode="past"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(screen.getByRole("button", { name: "과거만" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "모두" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  /** running/failed 는 order=0 (칸 첫 줄 우선), 나머지는 order=1 (cancelled 포함 — 회색 격하) */
  it("강조 상태 (running/failed) 가 order=0 으로 우선 정렬", () => {
    const events: SchedulerCalendarEvent[] = [
      { scheduler_job_id: "a", name: "완료1", start: "2026-05-15T08:00:00+09:00", status: "completed", kind: "past" },
      { scheduler_job_id: "b", name: "돌고있음", start: "2026-05-15T09:00:00+09:00", status: "running", kind: "past" },
      { scheduler_job_id: "c", name: "실패", start: "2026-05-15T10:00:00+09:00", status: "failed", kind: "past" },
      { scheduler_job_id: "d", name: "취소됨", start: "2026-05-15T11:00:00+09:00", status: "cancelled", kind: "past" },
      { scheduler_job_id: "e", name: "예정", start: "2026-05-25T12:00:00+09:00", status: "upcoming", kind: "upcoming" },
    ];
    render(
      <SchedulerCalendarView events={events} mode="both" onModeChange={() => {}} yearMonth="2026-05" />,
    );
    // FullCalendar 가 eventOrder='order' 받았는지
    expect(screen.getByTestId("fc-event-order").textContent).toBe("order");
    // 강조 3개는 0, 나머지 2개는 1
    expect(screen.getByTestId("fc-event-0").getAttribute("data-order")).toBe("1"); // 완료1
    expect(screen.getByTestId("fc-event-1").getAttribute("data-order")).toBe("0"); // 돌고있음
    expect(screen.getByTestId("fc-event-2").getAttribute("data-order")).toBe("0"); // 실패
    expect(screen.getByTestId("fc-event-3").getAttribute("data-order")).toBe("1"); // 취소됨 (회색 격하)
    expect(screen.getByTestId("fc-event-4").getAttribute("data-order")).toBe("1"); // 예정
  });
});
