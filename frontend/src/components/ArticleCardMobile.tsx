"use client";

import { memo } from "react";
import type { Article } from "@/types";
import { M2_TO_PYEONG, TRADE_TYPE_COLORS, TRADE_TYPE_DEFAULT_COLOR, ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { formatMaintenanceCost } from "@/lib/format";

interface Props {
  articles: Article[];
  onRowClick?: (articleNo: string) => void;
  selectedArticleNos?: Set<string>;
  onSelectionChange?: (articleNo: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean, visibleArticles: Article[]) => void;
}

/** 매물 목록 모바일 카드뷰 (md:hidden) — 데스크톱 ArticleTable의 모바일 대응 */
function ArticleCardMobile({ articles, onRowClick, selectedArticleNos, onSelectionChange, onSelectAll }: Props) {
  if (articles.length === 0) {
    return (
      <div className="text-center py-12 space-y-1">
        <p className="text-gray-500">매물이 없습니다.</p>
        <p className="text-xs text-gray-400">위의 &quot;데이터 갱신&quot; 버튼을 눌러보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {onSelectionChange && (
        <label className="flex items-center gap-2 px-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={articles.length > 0 && articles.every(a => selectedArticleNos?.has(a.article_no))}
            onChange={(e) => onSelectAll?.(e.target.checked, articles)}
            className="w-4 h-4 rounded border-gray-300"
          />
          전체 선택
        </label>
      )}
      {articles.map((art) => (
        <ArticleCardItem
          key={art.article_no}
          article={art}
          onClick={onRowClick}
          selected={selectedArticleNos?.has(art.article_no)}
          onCheck={onSelectionChange}
        />
      ))}
    </div>
  );
}

export default memo(ArticleCardMobile);

const ArticleCardItem = memo(function ArticleCardItem({ article: art, onClick, selected, onCheck }: {
  article: Article; onClick?: (no: string) => void; selected?: boolean; onCheck?: (articleNo: string, checked: boolean) => void;
}) {
  const isRent = art.trade_type_name === "월세" || art.trade_type_name === "단기임대";
  const price = isRent
    ? `${art.deal_or_warrant_prc ?? "-"} / ${art.rent_prc ?? "-"}`
    : art.deal_or_warrant_prc ?? "-";

  const areaM2 = art.area2_m2 ?? art.area1_m2;
  const areaTxt = areaM2
    ? `${areaM2}㎡(${Math.round(areaM2 / M2_TO_PYEONG * 10) / 10}평)`
    : null;

  const rooms = art.room_count != null && art.bathroom_count != null
    ? `${art.room_count}/${art.bathroom_count}`
    : art.room_count != null ? `${art.room_count}/-` : null;

  const maint = formatMaintenanceCost(art.maintenance_cost, art.numeric_maintenance_cost);

  return (
    <div
      className="bg-white rounded-lg shadow-sm border p-3 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors"
      onClick={() => onClick?.(art.article_no)}
    >
      {/* 1행: 체크+거래유형+가격 */}
      <div className="flex items-center gap-2">
        {onCheck && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onCheck(art.article_no, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 shrink-0"
          />
        )}
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
          TRADE_TYPE_COLORS[art.trade_type_name ?? ""] ?? TRADE_TYPE_DEFAULT_COLOR
        }`}>
          {art.trade_type_name ?? "-"}
        </span>
        {art.article_real_estate_type_name && art.article_real_estate_type_name !== "아파트" && (
          <span className={`px-1 py-0.5 rounded text-xs border shrink-0 ${
            ESTATE_TYPE_COLORS[art.article_real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR
          }`}>{art.article_real_estate_type_name}</span>
        )}
        <span className="font-semibold text-gray-900 text-sm">{price}</span>
        {art.previous_price != null && art.numeric_price != null && art.previous_price !== art.numeric_price && (
          <span className={`text-xs ${art.numeric_price < art.previous_price ? "text-blue-600" : "text-red-600"}`}>
            {art.numeric_price < art.previous_price ? "↓" : "↑"}
            {Math.abs(art.numeric_price - art.previous_price).toLocaleString()}
          </span>
        )}
      </div>

      {/* 2행: 면적·동·층 */}
      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-600">
        {areaTxt && <span>{areaTxt}</span>}
        {art.building_name && <><span className="text-gray-300">·</span><span>{art.building_name}</span></>}
        {art.floor_info && <><span className="text-gray-300">·</span><span>{art.floor_info}층</span></>}
      </div>

      {/* 3행: 방/욕·방향·입주·관리비 */}
      <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
        {rooms && <span>{rooms}</span>}
        {art.direction && <><span className="text-gray-300">·</span><span>{art.direction}</span></>}
        {art.move_in_date && <><span className="text-gray-300">·</span><span>{art.move_in_date}</span></>}
        {maint !== "-" && <><span className="text-gray-300">·</span><span>관리비 {maint}</span></>}
        {art.monthly_rent_yield != null && <><span className="text-gray-300">·</span><span className="text-emerald-600">수익률 {art.monthly_rent_yield}%</span></>}
        {art.article_jeonse_ratio != null && <><span className="text-gray-300">·</span><span className="text-blue-600">전세가율 {art.article_jeonse_ratio}%</span></>}
      </div>

      {/* 4행: 특징 (truncate) */}
      {art.article_feature_desc && (
        <p className="mt-1.5 text-xs text-gray-400 truncate">{art.article_feature_desc}</p>
      )}
    </div>
  );
});
