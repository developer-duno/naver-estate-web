"use client";

/** 스케줄러 월간 캘린더 — FullCalendar 6 daygrid view.
 *
 * 과거 (crawl_jobs) + 미래 (APScheduler trigger 전개) 실행 시각을 한 달 격자에 표시.
 * dayMaxEvents=3 으로 칸당 3개만 노출 + "더보기" 자동 압축. mode 토글 = 과거/예정/모두.
 *
 * a11y: 색만 의존하지 않도록 아이콘 약어 (✓·✗·→) 와 상태 한글 라벨 (JOB_STATUS_STYLES.label)
 * 병기. DataFreshnessCard 패턴 답습.
 */

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import koLocale from "@fullcalendar/core/locales/ko";
import type { DayCellContentArg, EventContentArg } from "@fullcalendar/core";

import type { SchedulerCalendarEvent } from "@/types/admin";
import { JOB_STATUS_STYLES } from "@/lib/admin/job-status-styles";

type CalendarMode = "past" | "upcoming" | "both";

interface Props {
  events: SchedulerCalendarEvent[];
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** 사용자 표시용 — 현재 보고 있는 월 (예: "2026-05") */
  yearMonth: string;
  truncated?: boolean;
}

/** dayMaxEvents 압축 시 emphasize=true 점이 칸 첫 줄에 노출되도록 우선순위 정렬.
 *  FullCalendar 의 eventOrder 가 숫자 비교 — 0 (먼저) ~ 1 (나중).
 */
function eventPriority(status: SchedulerCalendarEvent["status"]): number {
  return JOB_STATUS_STYLES[status]?.emphasize ? 0 : 1;
}

const MODE_OPTIONS: { value: CalendarMode; label: string }[] = [
  { value: "both", label: "모두" },
  { value: "past", label: "과거만" },
  { value: "upcoming", label: "예정만" },
];

export default function SchedulerCalendarView({
  events,
  mode,
  onModeChange,
  yearMonth,
  truncated = false,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // FullCalendar 가 기대하는 이벤트 포맷 ({ title, start, extendedProps })
  const calendarEvents = useMemo(
    () =>
      events.map((e) => ({
        title: e.name,
        start: e.start,
        // FullCalendar eventOrder 가 숫자/문자 필드 비교 — order 가 작은 게 먼저 (= 칸 첫 줄)
        order: eventPriority(e.status),
        extendedProps: {
          status: e.status,
          kind: e.kind,
          schedulerJobId: e.scheduler_job_id,
        },
      })),
    [events],
  );

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter((e) => e.start.startsWith(selectedDate));
  }, [events, selectedDate]);

  // FullCalendar 가 initialDate 변경 시 자동으로 해당 월로 이동
  const initialDate = `${yearMonth}-01`;

  // dayGridPlugin 만 사용 (interactionPlugin 안 깔아도 되도록), 날짜 클릭은
  // dayCellContent 안 button 으로 직접 처리.
  function renderDayCell(arg: DayCellContentArg) {
    // toISOString() 은 UTC 로 바꿔버려 KST 자정이 하루 전으로 밀린다 (8/14 칸 → 8/13 상세).
    // 이벤트 start 는 +09:00 로컬 문자열이라, 비교 키도 로컬 연·월·일로 조립해야 짝이 맞는다.
    const d = arg.date;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return (
      <button
        type="button"
        onClick={() => setSelectedDate(iso)}
        className="w-full text-right px-1 hover:underline focus:underline focus:outline-none"
        aria-label={`${iso} 상세 보기`}
      >
        {arg.dayNumberText}
      </button>
    );
  }

  return (
    <div>
      {/* 토글 + 안내 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex gap-1" role="group" aria-label="표시 모드">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-md border ${
                mode === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
              aria-pressed={mode === opt.value ? "true" : "false"}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          총 {events.length.toLocaleString()}개 실행
          {truncated && (
            <span className="ml-2 text-amber-700">· 50,000개에서 잘림</span>
          )}
        </p>
      </div>

      {/* 캘린더 본체 */}
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        initialDate={initialDate}
        locale={koLocale}
        events={calendarEvents}
        eventContent={renderEventContent}
        eventOrder="order"
        // end 없는 이벤트에 붙는 기본 1시간(FullCalendar 기본값 '01:00:00') 때문에 23시대
        // 실행이 다음날 칸까지 걸쳐 이중 표시되던 것을 0 길이로 차단 (칸별 개수 부풀림 해소).
        defaultTimedEventDuration="00:00"
        dayCellContent={renderDayCell}
        dayMaxEvents={3}
        height="auto"
        aspectRatio={1.35}
        headerToolbar={{ left: "title", center: "", right: "" }}
      />

      {/* 선택 날짜 상세 */}
      {selectedDate && selectedDateEvents.length > 0 && (
        <div className="mt-4 border rounded-md p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-800">
              {selectedDate} 실행 ({selectedDateEvents.length}건)
            </h3>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
              aria-label="상세 닫기"
            >
              닫기
            </button>
          </div>
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {selectedDateEvents.map((e, idx) => {
              const styles = JOB_STATUS_STYLES[e.status];
              const time = new Date(e.start).toLocaleTimeString("ko", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              return (
                <li key={idx} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block px-1.5 py-0.5 rounded ${styles.chip}`}>
                    {styles.icon} {styles.label}
                  </span>
                  <span className="text-gray-500 font-mono">{time}</span>
                  <span className="text-gray-800">{e.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 범례 — 강조 상태(running·failed·cancelled) 먼저 표시 */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-gray-500">
        <span className="font-medium text-gray-600">범례:</span>
        {(["running", "failed", "cancelled", "completed", "upcoming"] as const).map((s) => {
          // 범례 dot = emphasized 첫 토큰 = 강조 bg 컬러 (running blue-500 / failed red-500 / cancelled gray-100)
          const dotBg = JOB_STATUS_STYLES[s].emphasized.split(" ")[0];
          return (
            <span key={s} className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${dotBg}`} />
              <span>{JOB_STATUS_STYLES[s].icon} {JOB_STATUS_STYLES[s].label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function renderEventContent(arg: EventContentArg) {
  const status = arg.event.extendedProps.status as SchedulerCalendarEvent["status"];
  const styles = JOB_STATUS_STYLES[status] ?? JOB_STATUS_STYLES.upcoming;
  return (
    <div
      className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium ${styles.emphasized} ${styles.pulse ? "animate-pulse" : ""}`}
      title={`${arg.event.title} (${styles.label})`}
    >
      <span aria-hidden="true">{styles.icon} </span>
      <span className="sr-only">{styles.label}: </span>
      {arg.event.title}
    </div>
  );
}
