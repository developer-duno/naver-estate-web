/**
 * 의견함 화면 문구 한 곳 모음 (세션 437 PR C) — 공개 목록(/updates)과 관리자 의견함(/admin/opinions)이 같이 쓴다.
 * 상태 뱃지 문구는 사장님 확인 중이라 바뀔 수 있다 → 고칠 땐 이 파일만 고친다.
 * (보내기 창 OpinionDialog 의 종류·소식 선택지 문구와 같은 뜻이어야 한다 — 서버 짝꿍 = backend/routers/opinions.py)
 */
import type { AdminOpinionKind, OpinionInterest, OpinionStatus } from "@/lib/api/opinions";

/** 공개 목록 상태 뱃지 — 서버가 4상태를 다 보낼 수 있으므로 넷 다 둔다 */
export const PUBLIC_STATUS_BADGE: Record<OpinionStatus, { label: string; className: string }> = {
  fixed: { label: "고쳤어요", className: "bg-green-50 text-green-700 border-green-200" },
  replied: { label: "답했어요", className: "bg-blue-50 text-blue-700 border-blue-200" },
  new: { label: "살펴보는 중", className: "bg-gray-50 text-gray-600 border-gray-200" },
  closed: { label: "확인했어요", className: "bg-gray-50 text-gray-600 border-gray-200" },
};

/** 관리자 화면 상태 이름(필터·고르기 칸) */
export const ADMIN_STATUS_LABELS: Record<OpinionStatus, string> = {
  new: "새 의견",
  replied: "답했어요",
  fixed: "고쳤어요",
  closed: "닫음",
};

/** 관리자 화면 종류 이름 — 'error' 는 화면 오류 자동 보고(손님 보내기 창 OpinionDialog 의 KINDS 에는 넣지 않는다) */
export const OPINION_KIND_LABELS: Record<AdminOpinionKind, string> = {
  bug: "버그·오류",
  data: "정보가 틀려요",
  suggest: "건의·제안",
  other: "기타",
  error: "자동 오류",
};

export const OPINION_INTEREST_LABELS: Record<OpinionInterest, string> = {
  market: "지역 매물·호가 흐름",
  presale: "미분양·분양 일정",
  tax: "세금·제도",
  other: "기타",
};

/** ISO 시각 → 한국 시간 "YYYY.MM.DD"(withTime 이면 " HH:mm" 까지). 못 읽으면 "-" */
export function formatKstDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("year")}.${get("month")}.${get("day")}`;
  return withTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}
