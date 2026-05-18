import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import type { Complex } from "@/types";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

interface ComplexHeaderProps {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
}

/** 단지 상세 헤더 — 뒤로가기 + 단지명 + 즐겨찾기 + 매물유형 뱃지 + 마지막 크롤 시각 */
export default function ComplexHeader({
  complex,
  starred,
  onBack,
  onToggleFavorite,
}: ComplexHeaderProps) {
  return (
    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
      <button onClick={onBack} aria-label="이전 페이지" className="text-gray-500 hover:text-gray-600 text-xl">
        ←
      </button>
      <h1 className="text-lg md:text-2xl font-bold truncate">{complex.complex_name}</h1>
      <button
        onClick={onToggleFavorite}
        className={`text-xl transition-colors ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
        aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      >
        {starred ? "★" : "☆"}
      </button>
      {complex.real_estate_type_name && (
        <span className={`text-xs px-1.5 py-0.5 rounded border ${ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR}`}>
          {complex.real_estate_type_name}
        </span>
      )}
      {complex.last_crawled_at && (
        <span className="hidden sm:inline-flex text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          마지막 크롤링: {formatTimeAgo(complex.last_crawled_at)}
        </span>
      )}
    </div>
  );
}
