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

/** stub 이 렌더할 날짜 칸 — 로컬 자정 기준. UTC 변환 시 하루 전으로 밀리는 경계.
 *
 * ⚠ 날짜를 하드코딩하면 KST 에서만 맞는다 — 실제 FullCalendar 는 이벤트를 "로컬 시간대"
 * 로 환산해 칸에 놓으므로, stub 도 같은 기준(로컬 자정)으로 칸을 만들어야 다른 시간대
 * (CI·해외 브라우저)에서도 테스트가 성립한다. 5/15·5/25 는 기본 대조군으로 유지하고,
 * 샘플 이벤트가 실제로 놓이는 칸을 추가로 넣는다.
 */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}

const DAY_CELL_DATES = [new Date(2026, 4, 15, 0, 0, 0), new Date(2026, 4, 25, 0, 0, 0)];
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/core/locales/ko", () => ({ default: { code: "ko" } }));

import SchedulerCalendarView, { toLocalDateKey } from "../SchedulerCalendarView";

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

// 샘플 이벤트가 실제로 놓이는 로컬 칸을 stub 목록에 합친다 (중복 제거).
// KST 에서는 5/15·5/25 와 겹쳐 변화가 없고, UTC 등에서는 5/24 칸이 추가된다.
for (const ev of sampleEvents) {
  const cell = localMidnight(new Date(ev.start));
  if (!DAY_CELL_DATES.some((d) => d.getTime() === cell.getTime())) {
    DAY_CELL_DATES.push(cell);
  }
}

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
    // 칸 키를 로컬 축(toLocalDateKey)으로 조립하므로 어떤 시간대에서도 하루 전 날짜는
    // 나올 수 없다 — 옛 toISOString() 구현에서만 나타나던 증상이라 스킵 가드 없이 단언한다.
    expect(
      screen.queryByRole("button", { name: "2026-05-14 상세 보기" }),
    ).not.toBeInTheDocument();
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
    // 기대 날짜를 하드코딩("2026-05-25")하면 KST 에서만 맞는다 — "04:30+09:00" 은 UTC 로
    // 보면 5/24 19:30 이라 로컬 축에서는 5/24 칸에 놓인다. 이벤트에서 키를 유도해
    // 어느 시간대에서도 "배치된 칸 = 클릭 결과" 를 단언한다.
    const key = toLocalDateKey(new Date(sampleEvents[2].start));
    fireEvent.click(screen.getByRole("button", { name: `${key} 상세 보기` }));
    expect(screen.getByText(new RegExp(`${key} 실행 \\(1건\\)`))).toBeInTheDocument();
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

  /**
   * [적대리뷰 High② 회귀 가드] 칸 배치·라벨·상세 필터가 모두 "로컬 축" 이어야 한다.
   *
   * 옛 코드는 상세 필터만 문자열 접두사(`start.startsWith`)로 비교해 +09:00 고정 =
   * KST 날짜를 봤다. 칸은 로컬로 조립되므로 비-KST 브라우저에서 축이 갈려
   * "점이 보이는 칸을 눌렀는데 0건" 이 났다.
   *
   * 여기서는 KST 와 로컬 날짜가 갈리는 이벤트를 쓴다: "+09:00" 기준으로는 5/16 00:30
   * 이지만, 그 순간을 로컬(KST 아닌 곳)에서 보면 5/15 일 수 있다. 필터가 로컬 축이면
   * 이벤트는 항상 "자기가 실제로 배치된 칸" 에서 나온다.
   */
  it("상세 필터가 칸과 같은 로컬 축을 써서 배치된 칸에서 반드시 잡힌다", () => {
    const crossMidnight: SchedulerCalendarEvent = {
      scheduler_job_id: "late_night",
      name: "자정 넘긴 작업",
      start: "2026-05-16T00:30:00+09:00",
      status: "completed",
      kind: "past",
    };
    // stub 이 이 이벤트가 놓이는 로컬 날짜 칸을 렌더하도록 추가 (FullCalendar 가 실제로
    // 그 칸에 배치하는 것과 같은 기준 — 로컬 자정). 다른 테스트에 새지 않게 복원한다.
    const cell = localMidnight(new Date(crossMidnight.start));
    const saved = [...DAY_CELL_DATES];
    // 이미 있는 칸이면 추가하지 않는다 — 중복 칸은 getByRole 이 "여러 개 찾음" 으로 죽는다
    // (UTC 환경에서는 이 이벤트가 5/15 로 떨어져 기본 칸과 겹친다)
    if (!DAY_CELL_DATES.some((d) => d.getTime() === cell.getTime())) {
      DAY_CELL_DATES.push(cell);
    }
    try {
      runCrossMidnightAssertions(crossMidnight);
    } finally {
      DAY_CELL_DATES.length = 0;
      DAY_CELL_DATES.push(...saved);
    }
  });

  /** 위 테스트 본문 — DAY_CELL_DATES 복원을 finally 로 보장하려 함수로 분리 */
  function runCrossMidnightAssertions(crossMidnight: SchedulerCalendarEvent) {
    render(
      <SchedulerCalendarView
        events={[crossMidnight]}
        mode="both"
        onModeChange={() => {}}
        yearMonth="2026-05"
      />,
    );
    // 이 이벤트가 실제로 놓이는 로컬 날짜 = FullCalendar 가 칸을 정하는 기준과 동일
    const localKey = toLocalDateKey(new Date(crossMidnight.start));
    fireEvent.click(screen.getByRole("button", { name: `${localKey} 상세 보기` }));

    // 축이 일치하면 그 칸에서 1건이 잡힌다 (옛 문자열 필터는 비-KST 에서 0건)
    expect(screen.getByText(new RegExp(`${localKey} 실행 \\(1건\\)`))).toBeInTheDocument();
    const detailItems = screen.getAllByRole("listitem");
    expect(detailItems).toHaveLength(1);
    expect(detailItems[0].textContent).toContain("자정 넘긴 작업");
  }

  /** toLocalDateKey 는 UTC 변환 없이 로컬 연·월·일을 그대로 쓴다 */
  it("toLocalDateKey 가 로컬 자정 날짜를 그대로 돌려준다", () => {
    // 로컬 자정 → 같은 날짜. toISOString() 이었다면 UTC+ 환경에서 하루 전으로 밀린다.
    expect(toLocalDateKey(new Date(2026, 4, 15, 0, 0, 0))).toBe("2026-05-15");
    // 로컬 23:59 → 여전히 같은 날 (UTC 로는 다음날이 될 수 있는 경계)
    expect(toLocalDateKey(new Date(2026, 4, 15, 23, 59, 0))).toBe("2026-05-15");
    // 한 자리 월·일 zero-pad
    expect(toLocalDateKey(new Date(2026, 0, 3, 12, 0, 0))).toBe("2026-01-03");
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
