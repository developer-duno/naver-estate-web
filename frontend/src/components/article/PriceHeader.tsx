"use client";

import type { Article } from "@/types";
import { formatWon, formatDateFull } from "@/lib/format";
import {
  TRADE_TYPE_COLORS,
  TRADE_TYPE_DEFAULT_COLOR,
  ESTATE_TYPE_COLORS,
  ESTATE_TYPE_DEFAULT_COLOR,
} from "@/lib/constants";

interface Props {
  article: Article;
}

export default function PriceHeader({ article: a }: Props) {
  const isRent = a.trade_type_name === "월세" || a.trade_type_name === "단기임대";
  const price = isRent
    ? `${a.deal_or_warrant_prc ?? "-"} / ${a.rent_prc ?? "-"}`
    : a.deal_or_warrant_prc ?? "-";

  // 가격 변동 계산
  const priceDiff =
    a.previous_price != null && a.numeric_price != null
      ? a.numeric_price - a.previous_price
      : null;

  const tradeColor = TRADE_TYPE_COLORS[a.trade_type_name ?? ""] ?? TRADE_TYPE_DEFAULT_COLOR;
  const estateType = a.article_real_estate_type_name;
  const estateColor = estateType
    ? ESTATE_TYPE_COLORS[estateType] ?? ESTATE_TYPE_DEFAULT_COLOR
    : null;

  return (
    <div className="space-y-2">
      {/* 뱃지 행 */}
      <div className="flex flex-wrap gap-1.5">
        {a.trade_type_name && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${tradeColor}`}>
            {a.trade_type_name}
          </span>
        )}
        {estateColor && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${estateColor}`}>
            {estateType}
          </span>
        )}
        {a.is_verified && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700">
            ✓ 검증매물
          </span>
        )}
        {a.is_presale && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700">
            분양권
          </span>
        )}
      </div>

      {/* 가격 */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold">{price}</span>
        {a.price_per_pyeong != null && (
          <span className="text-sm text-gray-500">
            평당 {a.price_per_pyeong.toLocaleString()}만원
          </span>
        )}
      </div>

      {/* 가격 변동 */}
      {priceDiff != null && priceDiff !== 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className={priceDiff > 0 ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
            {priceDiff > 0 ? "▲" : "▼"} {formatWon(String(Math.abs(priceDiff) * 10000))}
          </span>
          {a.price_changed_at && (
            <span className="text-gray-400 text-xs">
              ({formatDateFull(a.price_changed_at.slice(0, 10).replace(/-/g, ""))})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
