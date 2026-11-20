/**
 * 만원 칸 아래 풀이 줄(세션 530 · B40 PR 3a) — 「50000」을 넣으면 「= 5억원」. 0 을 잘못 센 것을 바로 알게 한다.
 * - 빈 칸·0·음수·1만원 미만은 아무것도 안 그린다.
 * - 소수 만원은 만원 자리에서 반올림하지 않고 원 단위까지 푼다(1.5 → 「= 1만 5,000원」) — 계산에 들어가는 값과 같게 보이도록.
 * - 쉼표는 언어를 고정해 찍는다(브라우저 언어가 독일어면 「2.345」로 찍히는 것을 막는다).
 * 훅이 없어 서버·클라이언트 어디서나 쓸 수 있다.
 */

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 만원 숫자(칸의 글자 그대로도 됨) → 「1억 2,345만원」 꼴 · 그리지 않을 값이면 null */
export function manwonToKorean(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const manwon = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(manwon)) return null;
  // 소수 곱셈의 찌꺼기(1.23 × 10000 = 12300.000000000002)만 정수 원으로 맞춘다
  const won = Math.round(manwon * 10_000);
  if (won < 10_000) return null;
  const eok = Math.floor(won / 100_000_000);
  const man = Math.floor((won % 100_000_000) / 10_000);
  const rest = won % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${fmt(eok)}억`);
  if (man > 0) parts.push(`${fmt(man)}만`);
  if (rest > 0) parts.push(fmt(rest));
  return `${parts.join(" ")}원`;
}

export default function ManwonHint({ value, id }: { value: string | number | null | undefined; id?: string }) {
  const text = manwonToKorean(value);
  if (!text) return null;
  return (
    <p id={id} className="mt-1 text-xs text-brand-muted">
      = {text}
    </p>
  );
}
