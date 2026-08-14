/**
 * SchedulerCalendarView 컴포넌트 테스트.
 * 실행: npx vitest run src/components/admin/__tests__/SchedulerCalendarView.test.tsx
 *
 * FullCalendar 는 jsdom 에서 ResizeObserver / DOM 측정 의존이라 실 렌더 어려움.
 * → @fullcalendar/react 를 stub 해 props 전달과 토글·상세 로직만 검증.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SchedulerCalendarEvent } from "@/types/admin";

// FullCalendar 컴포넌트 자체를 stub — 호출된 props 만 노출
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    const events = (props.events ?? []) as Array<{ title: string; order?: number }>;
    // dayCellContent 는 실제 FullCalendar 가 칸마다 호출하는 렌더 함수 — 날짜 조립 로직
    // (KST 밀림 회귀 가드) 을 검증하려면 stub 이 대신 호출해줘야 한다.
    const dayCellContent = props.dayCellContent as
      | ((arg: { date: Date; dayNumberText: string }) => ReactNode)
      | undefined;
    return (
      <div data-testid="fc-stub">
        <span data-testid="fc-event-count">{events.length}</span>
        <span data-testid="fc-event-order">{props.eventOrder as string}</span>
        <span data-testid="fc-default-duration">
          {props.defaultTimedEventDuration as string}
        </span>
        {events.map((e, i) => (
          <span key={i} data-testid={`fc-event-${i}`} data-order={e.order}>
            {e.title}
          </span>
        ))}
        {dayCellContent && (
          <div data-testid="fc-day-cells">
            {DAY_CELL_DATES.map((d) => (
              <span key={d.getTime()}>
                {dayCellContent({ date: d, dayNumberText: String(d.getDate()) })}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
}));

/** stub 이 렌더할 날짜 칸 — 로컬(KST) 자정 기준. UTC 변환 시 하루 전으로 밀리는 경계. */
const DAY_CELL_DATES = [new Date(2026, 4, 15, 0, 0, 0), new Date(2026, 4, 25, 0, 0, 0)];
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

  /** 빈 이벤트 + truncated false 일 때 "총 0개 실행" */
  it("빈 이벤트도 안전하게 렌더된다", () => {
    render(
      <SchedulerCalendarView
        events={[]}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(screen.getByText(/총 0개 실행/)).toBeInTheDocument();
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

  /** 상태 표기가 영문 원문이 아니라 JOB_STATUS_STYLES 한글 라벨로 나온다 (상세 목록·범례) */
  it("상세 목록·범례가 한글 상태 라벨로 표시된다", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    // 범례 5종 — 영문 status 는 화면에 없어야 한다
    for (const label of ["실행 중", "실패", "취소", "완료", "예정"]) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
    for (const raw of ["running", "failed", "cancelled", "completed", "upcoming"]) {
      expect(screen.queryByText(raw)).not.toBeInTheDocument();
    }

    // 선택 날짜 상세 목록도 한글 라벨 (5/15 = completed + failed 2건)
    // 범례에도 같은 "✓ 완료" 문구가 있어 목록(li) 안으로 범위를 좁혀 단언한다.
    fireEvent.click(screen.getByRole("button", { name: "2026-05-15 상세 보기" }));
    expect(screen.getByText(/2026-05-15 실행 \(2건\)/)).toBeInTheDocument();
    const detailItems = screen.getAllByRole("listitem");
    const detailText = detailItems.map((li) => li.textContent ?? "").join("|");
    expect(detailText).toContain("✓ 완료");
    expect(detailText).toContain("✗ 실패");
  });

  /**
   * [버그A 회귀 가드] 날짜 칸의 aria-label 이 로컬(KST) 날짜와 일치해야 한다.
   * 옛 코드는 toISOString() 으로 UTC 변환해 KST 자정이 하루 전으로 밀렸다
   * (8/14 칸 클릭 → 8/13 상세). 이 단언은 수정 전 코드에서 실패한다.
   */
  it("날짜 칸 aria-label 이 UTC 로 밀리지 않고 로컬 날짜와 일치", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    // stub 이 렌더한 두 칸 = 2026-05-15 / 2026-05-25 (로컬 자정)
    expect(
      screen.getByRole("button", { name: "2026-05-15 상세 보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2026-05-25 상세 보기" }),
    ).toBeInTheDocument();
    // UTC 로 밀린 하루 전 날짜는 없어야 한다 (UTC+ 환경에서만 유의미한 대조군)
    if (DAY_CELL_DATES[0].getTimezoneOffset() < 0) {
      expect(
        screen.queryByRole("button", { name: "2026-05-14 상세 보기" }),
      ).not.toBeInTheDocument();
    }
  });

  /** 날짜 칸 클릭 시 그 로컬 날짜의 이벤트만 상세에 뜬다 (버그A 의 사용자 체감 증상) */
  it("날짜 칸 클릭 시 해당 로컬 날짜 이벤트가 상세에 표시된다", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2026-05-25 상세 보기" }));
    expect(screen.getByText(/2026-05-25 실행 \(1건\)/)).toBeInTheDocument();
    // 상세 목록(li) 은 1건만 — 그 안에 5/25 이벤트명이 들어야 한다
    // (stub 이벤트 목록에도 같은 제목이 있어 목록 안으로 범위를 좁힌다)
    const detailItems = screen.getAllByRole("listitem");
    expect(detailItems).toHaveLength(1);
    expect(detailItems[0].textContent).toContain("단지 가치지표 수집");
  });

  /**
   * [버그B 회귀 가드] end 없는 이벤트에 FullCalendar 기본 1시간이 붙어 23시대 실행이
   * 다음날 칸까지 겹쳐 보이던 것 → defaultTimedEventDuration="00:00" 로 0 길이 고정.
   */
  it("defaultTimedEventDuration 00:00 이 FullCalendar 에 전달된다", () => {
    render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(screen.getByTestId("fc-default-duration").textContent).toBe("00:00");
  });

  /** R3 — "발화"(내부 용어)를 화면에서 완전히 몰아냈는지 회귀 가드 */
  it("화면 어디에도 '발화' 라는 내부 용어가 남지 않는다", () => {
    const { container } = render(
      <SchedulerCalendarView
        events={sampleEvents}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    expect(container.textContent).not.toContain("발화");
    expect(container.textContent).toContain("실행");
  });
});
