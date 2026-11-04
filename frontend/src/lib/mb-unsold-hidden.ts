/**
 * 미분양 수 비공개 표시 글자 (세션 500 — 👤 2026-11-04 결정)
 *
 * 지자체 명단에는 올라 있는데 단지별 미분양 수를 공개하지 않는 단지(2026-09 대구시부터).
 * 판정은 서버 한 곳(`backend/db/mb_query_helpers.py is_unsold_hidden`) — 화면은 응답의
 * `unsold_hidden === true` 만 본다. 칸이 없으면(옛 서버) 지금 화면 그대로.
 */
import type { MbApartment, MbUnsoldHistory } from "@/types/mibunyang";

/** 응답 칸으로만 판정 — 칸이 없거나 false 면 비공개 아님 */
export function isUnsoldHidden(apt: Pick<MbApartment, "unsold_hidden">): boolean {
  return apt.unsold_hidden === true;
}

/** 명단을 낸 지자체 이름 — region 으로 정한다 */
export function unsoldListAuthority(region: string | null | undefined): string {
  switch (region) {
    case "대구":
      return "대구시";
    case "충남":
      return "충청남도";
    case "경기":
      return "경기도";
    default:
      return "지자체";
  }
}

/** 미분양 추이 절 위 안내 줄. as_of 가 없으면 '○○ 명단은', 추이 기록이 비면 둘째 문장을 뺀다 */
export function unsoldHiddenNotice(
  region: string | null | undefined,
  listedAsOf: string | null | undefined,
  history: Pick<MbUnsoldHistory, "base_month">[],
): string {
  const authority = unsoldListAuthority(region);
  const asOfMonth = listedAsOf ? Number(listedAsOf.slice(5, 7)) : NaN;
  const head = Number.isFinite(asOfMonth) && asOfMonth >= 1 && asOfMonth <= 12
    ? `${authority} ${asOfMonth}월 말 명단은`
    : `${authority} 명단은`;
  const first = `${head} 이 단지의 미분양 수를 공개하지 않습니다.`;

  const months = history.map((h) => h.base_month).filter((m) => typeof m === "string" && m.length >= 6);
  if (months.length === 0) return first;
  const last = months.reduce((a, b) => (b.localeCompare(a) > 0 ? b : a));
  const lastMonth = Number(last.slice(4, 6));
  if (!Number.isFinite(lastMonth) || lastMonth < 1 || lastMonth > 12) return first;
  return `${first} 아래는 ${lastMonth}월까지의 추정치입니다.`;
}
