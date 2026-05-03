"use client";

import { useArticleFavoriteStatus } from "@/hooks/useArticleFavorites";

interface Props {
  articleNo: string;
  complexNo: string;
  complexName?: string;
  tradeTypeName?: string;
  price?: string;
}

/** 매물 즐겨찾기 토글 버튼 — ☆/★ 아이콘 (localStorage 영속) */
export default function ArticleFavoriteButton({
  articleNo, complexNo, complexName, tradeTypeName, price,
}: Props) {
  const { starred, toggle } = useArticleFavoriteStatus(articleNo);

  const handleClick = () => {
    toggle({ complex_no: complexNo, complex_name: complexName, trade_type_name: tradeTypeName, price });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-xl transition-colors ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
      aria-label={starred ? "매물 즐겨찾기 해제" : "매물 즐겨찾기 추가"}
      aria-pressed={starred}
      title={starred ? "매물 즐겨찾기 해제" : "매물 즐겨찾기 추가"}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}
