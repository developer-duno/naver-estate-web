import { tradeLineText } from "@/lib/range-price";
import type { AreaTrade } from "@/types";

interface Props {
  areaM2: number;
  /** 대표 면적 최근 6개월 거래 — BE 가 거래일 내림차순(날짜 없는 거래는 뒤)으로 준다, 그 순서 그대로 */
  trades: AreaTrade[];
}

/** 시세 칸을 펼치면 보이는 대표 면적 거래 목록(세션 479 B29 설계 §3 결정 2·3 — 최근 6개월 전부 · 직거래 표시) */
export default function RepAreaTradeList({ areaM2, trades }: Props) {
  if (trades.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-700">전용 {areaM2}㎡ 대 최근 6개월 정부 실거래 {trades.length}건</p>
      <ul className="divide-y rounded border text-sm" data-testid="rep-trade-list">
        {trades.map((t, i) => (
          <li key={`${t.date ?? "none"}-${t.price}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
            <span>{tradeLineText(t)}</span>
            {t.direct && <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500">직거래</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
