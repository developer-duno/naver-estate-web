"use client";

/** 스케줄러 월간 캘린더 — FullCalendar 6 daygrid view.
 *
 * 과거 (crawl_jobs) + 미래 (APScheduler trigger 전개) 발화 시각을 한 달 격자에 표시.
 * dayMaxEvents=3 으로 칸당 3개만 노출 + "더보기" 자동 압축. mode 토글 = 과거/예정/모두.
 *
 * a11y: 색만 의존하지 않도록 아이콘 약어 (✓·✗·→) 와 상태 텍스트 병기. DataFreshnessCard
 * 패턴 답습.
 */

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import koLocale from "@fullcalendar/core/locales/ko";
import type { DayCellContentArg, EventContentArg } from "@fullcalendar/core";

import type { SchedulerCalendarEvent } from "@/types/admin";

type CalendarMode = "past" | "upcoming" | "both";

interface Props {
  events: SchedulerCalendarEvent[];
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  /** 사용자 표시용 — 현재 보고 있는 월 (예: "2026-05") */
  yearMonth: string;
  truncated?: boolean;
}

const STATUS_STYLES: Record<SchedulerCalendarEvent["status"], { bg: string; text: string; icon: string }> = {
  completed: { bg: "bg-green-100", text: "text-green-800", icon: "✓" },
  running: { bg: "bg-blue-100", text: "text-blue-800", icon: "▶" },
  failed: { bg: "bg-red-100", text: "text-red-800", icon: "✗" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-600", icon: "—" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-800", icon: "…" },
  paused: { bg: "bg-orange-100", text: "text-orange-800", icon: "⏸" },
  upcoming: { bg: "bg-sky-50", text: "text-sky-700", icon: "→" },
};

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
    const iso = arg.date.toISOString().slice(0, 10);
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
          총 {events.length.toLocaleString()}개 발화
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
              {selectedDate} 발화 ({selectedDateEvents.length}건)
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
              const styles = STATUS_STYLES[e.status];
              const time = new Date(e.start).toLocaleTimeString("ko", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              return (
                <li key={idx} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block px-1.5 py-0.5 rounded ${styles.bg} ${styles.text}`}>
                    {styles.icon} {e.status}
                  </span>
                  <span className="text-gray-500 font-mono">{time}</span>
                  <span className="text-gray-800">{e.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 범례 */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-gray-500">
        <span className="font-medium text-gray-600">범례:</span>
        {(["completed", "failed", "running", "upcoming"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-full ${STATUS_STYLES[s].bg}`} />
            <span>{STATUS_STYLES[s].icon} {s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function renderEventContent(arg: EventContentArg) {
  const status = arg.event.extendedProps.status as SchedulerCalendarEvent["status"];
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.upcoming;
  return (
    <div
      className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${styles.bg} ${styles.text}`}
      title={`${arg.event.title} (${status})`}
    >
      <span aria-hidden="true">{styles.icon} </span>
      <span className="sr-only">{status}: </span>
      {arg.event.title}
    </div>
  );
}
