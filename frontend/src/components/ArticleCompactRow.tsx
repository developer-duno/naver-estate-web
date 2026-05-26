"use client";

import { memo } from "react";
import type { Article } from "@/types";
import { M2_TO_PYEONG, TRADE_TYPE_COLORS, TRADE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import ArticleFavoriteButton from "@/components/ArticleFavoriteButton";

interface Props {
  article: Article;
  onClick?: (articleNo: string) => void;
  selected?: boolean;
  onCheck?: (articleNo: string, checked: boolean) => void;
}

/** 매물 카드 1줄 모양 (compact) — 모바일 한 화면에 매물 다수 표시. 320px 화면에서 체크박스·★ 잘림 0 보장 (shrink-0). */
function ArticleCompactRow({ article: art, onClick, selected, onCheck }: Props) {
  const isRent = art.trade_type_name === "월세" || art.trade_type_name === "단기임대";
  const price = isRent
    ? `${art.deal_or_warrant_prc ?? "-"} / ${art.rent_prc ?? "-"}`
    : art.deal_or_warrant_prc ?? "-";

  const areaM2 = art.area2_m2 ?? art.area1_m2;
  const areaTxt = areaM2
    ? `${areaM2}㎡(${Math.round(areaM2 / M2_TO_PYEONG * 10) / 10}평)`
    : null;

  return (
    <div
      className="flex items-center gap-1.5 bg-white rounded-md shadow-sm border px-2 py-1.5 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
      onClick={() => onClick?.(art.article_no)}
    >
      {onCheck && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => onCheck(art.article_no, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 shrink-0"
        />
      )}
      <span className={`px-1.5 py-0.5 rounded text-sm font-medium shrink-0 ${
        TRADE_TYPE_COLORS[art.trade_type_name ?? ""] ?? TRADE_TYPE_DEFAULT_COLOR
      }`}>
        {art.trade_type_name ?? "-"}
      </span>
      <span className="font-semibold text-gray-900 text-sm shrink-0">{price}</span>
      {art.previous_price != null && art.numeric_price != null && art.previous_price !== art.numeric_price && (
        <span className={`text-sm shrink-0 ${art.numeric_price < art.previous_price ? "text-blue-600" : "text-red-600"}`}>
          {art.numeric_price < art.previous_price ? "↓" : "↑"}
        </span>
      )}
      <span className="text-sm text-gray-600 truncate min-w-0">
        {areaTxt}
        {art.floor_info && <span className="text-gray-400"> · {art.floor_info}층</span>}
      </span>
      <span className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
        <ArticleFavoriteButton
          articleNo={art.article_no}
          complexNo={art.complex_no}
          complexName={art.complex_name}
          tradeTypeName={art.trade_type_name}
          price={art.deal_or_warrant_prc}
        />
      </span>
    </div>
  );
}

export default memo(ArticleCompactRow);
