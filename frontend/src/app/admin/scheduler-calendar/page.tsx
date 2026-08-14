"use client";

/** /admin/scheduler-calendar — 스케줄러 월간 캘린더 페이지. */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import { getSchedulerCalendar } from "@/lib/api";
import type { SchedulerCalendarResponse } from "@/types/admin";

import AdminCard from "@/components/admin/AdminCard";
import SchedulerCalendarView from "@/components/admin/SchedulerCalendarView";

type CalendarMode = "past" | "upcoming" | "both";

function todayYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function SchedulerCalendarPage() {
  const { token } = useTokenReady();
  const [{ year, month }, setYM] = useState(todayYearMonth);
  const [mode, setMode] = useState<CalendarMode>("both");

  const query = useQuery<SchedulerCalendarResponse, Error>({
    queryKey: queryKeys.admin.schedulerCalendar(year, month, mode),
    queryFn: () => getSchedulerCalendar(token, { year, month, mode }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const yearMonth = useMemo(
    () => `${year}-${String(month).padStart(2, "0")}`,
    [year, month],
  );

  // 카드 제목은 사람이 읽는 "2026년 8월" 형태로 (yearMonth 는 FullCalendar initialDate 용 키)
  const yearMonthLabel = `${year}년 ${month}월`;

  const movePrev = () => {
    if (month === 1) setYM({ year: year - 1, month: 12 });
    else setYM({ year, month: month - 1 });
  };
  const moveNext = () => {
    if (month === 12) setYM({ year: year + 1, month: 1 });
    else setYM({ year, month: month + 1 });
  };
  const moveToday = () => setYM(todayYearMonth());

  const navAction = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={movePrev}
        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
        aria-label="이전 달"
      >
        ←
      </button>
      <button
        type="button"
        onClick={moveToday}
        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
      >
        오늘
      </button>
      <button
        type="button"
        onClick={moveNext}
        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
        aria-label="다음 달"
      >
        →
      </button>
    </div>
  );

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">스케줄러 캘린더</h2>

      <AdminCard
        title={`${yearMonthLabel} 실행 일정`}
        help="자동으로 돌아가는 작업이 언제 돌았고(과거), 앞으로 언제 돌 예정인지(예정) 달력으로 보여줘요. 같은 날 칸에 점이 빽빽하면 그날 작업이 몰린 거예요. 날짜 칸을 누르면 그날 실행된 작업 목록을 시각순으로 볼 수 있어요."
        action={navAction}
      >
        {query.isLoading ? (
          <div className="text-sm text-gray-500 py-8 text-center" role="status">
            로딩 중...
          </div>
        ) : query.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            캘린더 조회 실패: {query.error.message}
          </div>
        ) : query.data ? (
          <SchedulerCalendarView
            events={query.data.events}
            mode={mode}
            onModeChange={setMode}
            yearMonth={yearMonth}
            truncated={query.data.truncated}
          />
        ) : null}
      </AdminCard>
    </>
  );
}
