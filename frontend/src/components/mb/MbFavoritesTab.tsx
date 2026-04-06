"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

const MAX_BATCH_COMPARE = 4;
type FavSortBy = "added_at" | "name" | "region";

interface FavoriteItem {
  id: string;
  name: string;
  region?: string;
  added_at: number;
}

interface Props {
  favorites: FavoriteItem[];
  onRemove: (item: { id: string; name: string; region?: string }) => void;
}

export default function MbFavoritesTab({ favorites, onRemove }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<FavSortBy>("added_at");

  const sortedFavorites = useMemo(() => {
    const sorted = [...favorites];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
        break;
      case "region":
        sorted.sort((a, b) => (a.region ?? "").localeCompare(b.region ?? "", "ko"));
        break;
      case "added_at":
      default:
        sorted.sort((a, b) => b.added_at - a.added_at);
        break;
    }
    return sorted;
  }, [favorites, sortBy]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_BATCH_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === Math.min(sortedFavorites.length, MAX_BATCH_COMPARE)) return new Set();
      return new Set(sortedFavorites.slice(0, MAX_BATCH_COMPARE).map((f) => f.id));
    });
  }, [sortedFavorites]);

  const handleBatchCompare = () => {
    if (selected.size < 2) return;
    const ids = Array.from(selected).join(",");
    router.push(`/mibunyang/compare?ids=${ids}`);
  };

  if (favorites.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg mb-2">즐겨찾기한 단지가 없습니다</p>
        <p className="text-sm">단지 목록에서 ★를 눌러 추가해보세요.</p>
      </div>
    );
  }

  const allChecked = selected.size === Math.min(favorites.length, MAX_BATCH_COMPARE);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{favorites.length}개 단지</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FavSortBy)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="정렬 기준"
          >
            <option value="added_at">추가일순</option>
            <option value="name">단지명순</option>
            <option value="region">지역순</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-gray-500">{selected.size}/{MAX_BATCH_COMPARE}개 선택</span>
          )}
          <button
            type="button"
            onClick={handleBatchCompare}
            disabled={selected.size < 2}
            className="px-3 py-1 text-xs rounded border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            선택 비교
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-center w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  className="accent-blue-600"
                />
              </th>
              <th className="px-3 py-2 text-left text-gray-600 w-12">#</th>
              <th className="px-3 py-2 text-left text-gray-600">단지명</th>
              <th className="px-3 py-2 text-left text-gray-600">지역</th>
              <th className="px-3 py-2 text-center text-gray-600">추가일</th>
              <th className="px-3 py-2 text-center text-gray-600 w-16">삭제</th>
            </tr>
          </thead>
          <tbody>
            {sortedFavorites.map((fav, i) => (
              <tr
                key={fav.id}
                className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                  selected.has(fav.id) ? "bg-blue-50/60" : ""
                }`}
                onClick={() => router.push(`/mibunyang/${fav.id}`)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/mibunyang/${fav.id}`); }}
              >
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(fav.id)}
                    disabled={!selected.has(fav.id) && selected.size >= MAX_BATCH_COMPARE}
                    onChange={() => toggleSelect(fav.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${fav.name} 선택`}
                    className="accent-blue-600"
                  />
                </td>
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{fav.name}</td>
                <td className="px-3 py-2 text-gray-500">{fav.region ?? "-"}</td>
                <td className="px-3 py-2 text-center text-gray-400 text-xs">
                  {new Date(fav.added_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove({ id: fav.id, name: fav.name, region: fav.region }); }}
                    className="text-gray-300 hover:text-red-500 text-lg leading-none"
                    aria-label={`${fav.name} 즐겨찾기 해제`}
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
