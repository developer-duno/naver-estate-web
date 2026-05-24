/** 스케줄러/크롤 잡 상태 SSOT.
 *
 * - chip: 작은 뱃지 배경+글자색 (`bg-X text-Y` 결합 문자열, 100/700 톤 통일)
 * - emphasized: 캘린더 전용 강조형 (running·failed 만 채워진 색 + 흰 글씨)
 * - icon: 캘린더 전용 아이콘 (a11y 보조)
 * - pulse: 캘린더 running 만 깜빡임
 * - hex: Recharts 차트용 hex 색 (잡 결과 통계용 4상태만 정의)
 * - label: 한글 라벨 (CrawlJobTable 답습)
 *
 * cancelled 회색 격하 = PR #51 답습 (실패 아님 = 강조 X, 회색 톤 통일).
 */
export type JobStatus =
  | "completed"
  | "running"
  | "failed"
  | "cancelled"
  | "pending"
  | "paused"
  | "upcoming";

export interface JobStatusStyle {
  /** 일반 뱃지용 100/700 결합 문자열 (SchedulerMonitor / CrawlJobTable) */
  chip: string;
  /** 캘린더 강조형 결합 문자열 (SchedulerCalendarView eventContent) */
  emphasized: string;
  /** 캘린더 아이콘 (a11y 보조) */
  icon: string;
  /** 캘린더 dayMaxEvents 우선순위 (running·failed 만 true) */
  emphasize?: boolean;
  /** 캘린더 깜빡 애니메이션 (running 만 true) */
  pulse?: boolean;
  /** Recharts 차트용 hex 색 — 정의된 상태만 (ErrorRateChart) */
  hex?: string;
  /** 한글 라벨 (CrawlJobTable 답습) */
  label: string;
}

export const JOB_STATUS_STYLES: Record<JobStatus, JobStatusStyle> = {
  completed: {
    chip: "bg-green-100 text-green-700",
    emphasized: "bg-green-100 text-green-800",
    icon: "✓",
    hex: "#10b981",
    label: "완료",
  },
  running: {
    chip: "bg-blue-100 text-blue-700",
    emphasized: "bg-blue-500 text-white",
    icon: "▶",
    emphasize: true,
    pulse: true,
    label: "실행 중",
  },
  failed: {
    chip: "bg-red-100 text-red-700",
    emphasized: "bg-red-500 text-white",
    icon: "✗",
    emphasize: true,
    hex: "#ef4444",
    label: "실패",
  },
  cancelled: {
    chip: "bg-gray-100 text-gray-500",
    emphasized: "bg-gray-100 text-gray-500",
    icon: "—",
    hex: "#9ca3af",
    label: "취소",
  },
  pending: {
    chip: "bg-yellow-100 text-yellow-700",
    emphasized: "bg-yellow-100 text-yellow-800",
    icon: "…",
    label: "대기",
  },
  paused: {
    chip: "bg-amber-100 text-amber-700",
    emphasized: "bg-orange-100 text-orange-800",
    icon: "⏸",
    hex: "#f59e0b",
    label: "일시정지",
  },
  upcoming: {
    chip: "bg-sky-50 text-sky-700",
    emphasized: "bg-sky-50 text-sky-700",
    icon: "→",
    label: "예정",
  },
};

/** 미정의 상태에 대한 안전 폴백 (예: 백엔드가 새 상태 추가 시 회색 처리) */
export const FALLBACK_CHIP = "bg-gray-100 text-gray-600";
