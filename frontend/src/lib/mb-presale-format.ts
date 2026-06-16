/**
 * 분양(청약홈) 표시 포맷 유틸 — house_ty 평형 포맷 + 청약 일정 날짜/D-day.
 *
 * ⚠ D-day timezone (.claude/rules timezone-consistency): 청약 일정(recruit_date 등)은
 * date-only('2026-06-05') 라 시각·시간대가 없다. 한국 청약 마감은 KST 자정 기준이므로
 * 날짜를 KST 자정으로 고정해 비교한다. new Date()(브라우저 로컬 의존) 로 today 를 잡으면
 * 사용자 시간대·서버 위치(UTC)에 따라 D-day 가 하루 어긋난다 → 날짜 문자열을 YYYY-MM-DD
 * 정수로 환산해 비교(자정 고정)하므로 환경 무관.
 */

/** 'YYYY-MM-DD' (또는 ISO 앞 10자) → {y,m,d} 정수. 파싱 실패 시 null. */
function parseYmd(dateStr?: string | null): { y: number; m: number; d: number } | null {
  if (!dateStr) return null;
  const m = dateStr.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 'YYYY-MM-DD' → 일련 정수(자정 고정, UTC epoch 일수). 두 날짜 차이 계산용. */
function ymdToDayNumber(p: { y: number; m: number; d: number }): number {
  // Date.UTC 로 자정(00:00:00 UTC) epoch ms → 일수. 로컬 시간대 무관.
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

/** 오늘(KST 자정)의 일련 정수. nowMs 미주입 시 Date.now() 사용 — KST(UTC+9) 보정 후 자정. */
function todayDayNumberKst(nowMs?: number): number {
  const ms = nowMs ?? Date.now();
  // KST = UTC+9. UTC epoch 에 9시간 더한 뒤 일수로 내림 = KST 자정 기준 일수.
  return Math.floor((ms + 9 * 3_600_000) / 86_400_000);
}

/**
 * 청약 일정(date-only)까지 남은 일수. 미래 양수, 당일 0, 과거 음수. 파싱 실패 시 null.
 * nowMs 주입 가능(테스트 결정성 — 하드코딩 시각 금지, timezone-consistency 룰5).
 */
export function getDday(dateStr?: string | null, nowMs?: number): number | null {
  const p = parseYmd(dateStr);
  if (!p) return null;
  return ymdToDayNumber(p) - todayDayNumberKst(nowMs);
}

/** D-day 라벨: 미래 'D-3', 당일 'D-DAY', 과거 'D+2'(마감 후). null 이면 '' */
export function formatDday(dateStr?: string | null, nowMs?: number): string {
  const d = getDday(dateStr, nowMs);
  if (d == null) return "";
  if (d === 0) return "D-DAY";
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD' 표시. 빈값/실패 시 '-' */
export function formatScheduleDate(dateStr?: string | null): string {
  const p = parseYmd(dateStr);
  if (!p) return "-";
  return `${p.y}.${String(p.m).padStart(2, "0")}.${String(p.d).padStart(2, "0")}`;
}

/** 기간 표시: 시작·종료 → 'YYYY.MM.DD ~ YYYY.MM.DD' (한쪽만 있으면 그것만). 둘 다 없으면 '-' */
export function formatDateRange(start?: string | null, end?: string | null): string {
  const s = parseYmd(start) ? formatScheduleDate(start) : "";
  const e = parseYmd(end) ? formatScheduleDate(end) : "";
  if (s && e) return `${s} ~ ${e}`;
  return s || e || "-";
}

/**
 * 청약홈 house_ty('051.0000A', '084.9900B') → 표시용 '51㎡A' / '85㎡B'.
 * 정수부 ㎡ + 타입 알파벳 접미사. 파싱 실패 시 원본 반환(정보 손실 방지).
 */
export function formatPresaleHouseType(houseTy?: string | null): string {
  if (!houseTy) return "-";
  // 051.0000A → 숫자부(051.0000) + 접미(A). 소수점 앞 정수만 반올림 표시.
  const m = houseTy.match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/);
  if (!m) return houseTy;
  const area = Math.round(Number(m[1]));
  if (!Number.isFinite(area) || area === 0) return houseTy;
  return `${area}㎡${m[2] ?? ""}`;
}

/** 입주예정월 'YYYYMM' → 'YYYY.MM' 표시. 실패 시 원본 또는 '-' */
export function formatMoveInYm(ym?: string | null): string {
  if (!ym) return "-";
  const m = ym.match(/^(\d{4})(\d{2})$/);
  if (!m) return ym;
  return `${m[1]}.${m[2]}`;
}
