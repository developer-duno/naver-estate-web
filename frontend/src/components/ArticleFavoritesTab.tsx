"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FavoriteArticle } from "@/lib/storage";
import { EmptyState } from "@/components/ui/empty-state";
import { Star } from "lucide-react";

// FavoriteArticle 에는 region 이 없어 MbFavoritesTab 의 지역 정렬축은 제외.
// 가격(deal_or_warrant_prc)은 거래유형별 형식이 달라(매매 "5억" / 월세 "3억/50") 정렬 신뢰도가 낮으므로 정렬축에서 제외.
type ArticleFavSortBy = "added_at" | "name" | "trade";

interface Props {
  favorites: FavoriteArticle[];
  onRowClick: (articleNo: string) => void;
  onRemove: (item: Omit<FavoriteArticle, "added_at">) => void;
}

/** 매물 즐겨찾기 모아보기 — MbFavoritesTab 패턴 답습 (지역 제외, 비교 체크박스 제외, 행 클릭 → 매물 상세 모달) */
export default function ArticleFavoritesTab({ favorites, onRowClick, onRemove }: Props) {
  const [sortBy, setSortBy] = useState<ArticleFavSortBy>("added_at");

  const sorted = useMemo(() => {
    const list = [...favorites];
    switch (sortBy) {
      case "name":
        list.sort((a, b) => (a.complex_name ?? "").localeCompare(b.complex_name ?? "", "ko"));
        break;
      case "trade":
        list.sort((a, b) => (a.trade_type_name ?? "").localeCompare(b.trade_type_name ?? "", "ko"));
        break;
      case "added_at":
      default:
        list.sort((a, b) => b.added_at - a.added_at);
        break;
    }
    return list;
  }, [favorites, sortBy]);

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="즐겨찾기한 매물이 없습니다"
        description="매물 목록이나 상세에서 ☆를 눌러 추가해보세요."
        action={
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            매물 검색하러 가기
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-500">{favorites.length}개 매물</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as ArticleFavSortBy)}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="정렬 기준"
        >
          <option value="added_at">추가일순</option>
          <option value="name">단지명순</option>
          <option value="trade">거래유형순</option>
        </select>
      </div>
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-gray-600">단지명</th>
              <th className="px-3 py-2 text-left text-gray-600">거래유형</th>
              <th className="px-3 py-2 text-left text-gray-600">가격</th>
              {/* 360px 5컬럼 비좁음 — 추가일은 sm 미만 숨김 (정렬축으로는 계속 사용) */}
              <th className="px-3 py-2 text-center text-gray-600 hidden sm:table-cell">추가일</th>
              <th className="px-3 py-2 text-center text-gray-600 w-16">삭제</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((fav) => (
              <tr
                key={fav.article_no}
                className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer"
                onClick={() => onRowClick(fav.article_no)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onRowClick(fav.article_no); }}
              >
                <td className="px-3 py-2 font-medium text-gray-900">
                  {/* 단지 페이지 직행 링크 — 행 클릭(매물 모달)과 분리 (td 내부 anchor 는 HTML 유효) */}
                  {fav.complex_no ? (
                    <Link
                      href={`/complex/${fav.complex_no}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-blue-600 hover:underline"
                      aria-label={`${fav.complex_name ?? "단지"} 단지 페이지로 이동`}
                    >
                      {fav.complex_name ?? "-"}
                    </Link>
                  ) : (
                    fav.complex_name ?? "-"
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">{fav.trade_type_name ?? "-"}</td>
                <td className="px-3 py-2 text-gray-700">{fav.price ?? "-"}</td>
                <td className="px-3 py-2 text-center text-gray-400 text-xs hidden sm:table-cell">
                  {new Date(fav.added_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove({
                        article_no: fav.article_no,
                        complex_no: fav.complex_no,
                        complex_name: fav.complex_name,
                        trade_type_name: fav.trade_type_name,
                        price: fav.price,
                      });
                    }}
                    className="inline-flex min-h-[44px] min-w-[44px] -my-3 items-center justify-center text-gray-300 hover:text-red-500 text-lg leading-none"
                    aria-label={`${fav.complex_name ?? "매물"} 즐겨찾기 해제`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
