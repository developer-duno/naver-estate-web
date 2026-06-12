import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
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
  isCompared?: boolean;
  compareFull?: boolean;
  onToggleCompare?: () => void;
}

/** 단지 상세 헤더 — 뒤로가기 + 단지명 + 즐겨찾기 + 비교 담기 + 매물유형 뱃지 + 매물 업데이트 시각 */
export default function ComplexHeader({
  complex,
  starred,
  onBack,
  onToggleFavorite,
  isCompared,
  compareFull,
  onToggleCompare,
}: ComplexHeaderProps) {
  return (
    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
      <button type="button" onClick={onBack} aria-label="이전 페이지" className="text-gray-500 hover:text-gray-600 text-xl rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        ←
      </button>
      <h1 className="text-lg md:text-2xl font-bold truncate">{complex.complex_name}</h1>
      <button
        type="button"
        onClick={onToggleFavorite}
        className={`text-xl transition-colors ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
        aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      >
        {starred ? "★" : "☆"}
      </button>
      {onToggleCompare && (
        <button
          type="button"
          onClick={onToggleCompare}
          disabled={!isCompared && compareFull}
          className={`no-print text-xs px-2.5 py-1 rounded border transition-colors ${
            isCompared
              ? "bg-blue-600 text-white border-blue-600"
              : compareFull
                ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-500 border-gray-300 hover:bg-blue-50 hover:text-blue-600"
          }`}
          aria-label={isCompared ? `${complex.complex_name} 비교 해제` : compareFull ? "비교 목록 가득 참 — 기존 단지를 먼저 빼주세요" : `${complex.complex_name} 비교 추가`}
          title={isCompared ? "비교 해제" : compareFull ? "비교 목록 가득 참 (4/4)" : "비교 추가"}
        >
          {isCompared ? "✓ 비교중" : "+ 비교"}
        </button>
      )}
      {complex.real_estate_type_name && (
        <Badge variant="outline" className={ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR}>
          {complex.real_estate_type_name}
        </Badge>
      )}
      {complex.last_crawled_at && (
        <span className="inline-flex text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          매물 업데이트: {formatTimeAgo(complex.last_crawled_at)}
        </span>
      )}
    </div>
  );
}
