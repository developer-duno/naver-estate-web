/**
 * 시각 → 한국어 상대 표기 ("3분 전", "5시간 전" 등)
 * date-fns 의존성 없이 admin 카드용으로만 사용.
 */
export function formatRelativeKo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "미수집";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "미수집";
  const diffSec = Math.floor((now.getTime() - t) / 1000);
  if (diffSec < 0) return "방금";
  if (diffSec < 60) return "방금";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}
