import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import type { Complex } from "@/types";

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export interface FavoriteCompareProps {
  name: string;
  starred: boolean;
  onToggleFavorite: () => void;
  isCompared?: boolean;
  compareFull?: boolean;
  onToggleCompare?: () => void;
  /** 모양 두 벌 — default = 지금 그대로(중개사 머리 등) · navy = 남색 띠 안 테두리 단추(글자 붙음 · 높이 44px, 세션 524 B40 PR 1) */
  tone?: "default" | "navy";
}

/** 남색 띠 안 테두리 단추 — 비교 단추는 상태에 따라 칠함·흐림 */
const NAVY_BTN = "no-print inline-flex min-h-11 items-center gap-1 rounded-lg border px-3.5 text-sm font-bold transition-colors";
function navyCompareClass(isCompared: boolean | undefined, compareFull: boolean | undefined): string {
  if (isCompared) return `${NAVY_BTN} border-white bg-white text-brand-navy`;
  if (compareFull) return `${NAVY_BTN} cursor-not-allowed border-brand-navy-line text-brand-on-navy-muted opacity-60`;
  return `${NAVY_BTN} border-brand-navy-line text-white hover:bg-white/10`;
}

/** 즐겨찾기 ★ + 비교 담기 버튼 — 머리 줄과 서버 h1 옆(소비자 화면, 세션 483 PR 3b)이 같은 버튼을 쓴다 */
export function FavoriteCompareButtons({ name, starred, onToggleFavorite, isCompared, compareFull, onToggleCompare, tone = "default" }: FavoriteCompareProps) {
  const navy = tone === "navy";
  return (
    <>
      <button
        type="button"
        onClick={onToggleFavorite}
        className={
          navy
            ? `${NAVY_BTN} border-brand-navy-line text-white hover:bg-white/10`
            : `text-xl transition-colors ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`
        }
        aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      >
        {navy ? (
          <>
            <span aria-hidden="true" className={starred ? "text-brand-orange" : ""}>{starred ? "★" : "☆"}</span>
            즐겨찾기
          </>
        ) : starred ? "★" : "☆"}
      </button>
      {onToggleCompare && (
        <button
          type="button"
          onClick={onToggleCompare}
          disabled={!isCompared && compareFull}
          className={navy ? navyCompareClass(isCompared, compareFull) : `no-print text-xs px-2.5 py-1 rounded border transition-colors ${
            isCompared
              ? "bg-blue-600 text-white border-blue-600"
              : compareFull
                ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-500 border-gray-300 hover:bg-blue-50 hover:text-blue-600"
          }`}
          aria-label={isCompared ? `${name} 비교 해제` : compareFull ? "비교 목록 가득 참 — 기존 단지를 먼저 빼주세요" : `${name} 비교 추가`}
          title={isCompared ? "비교 해제" : compareFull ? "비교 목록 가득 참 (4/4)" : "비교 추가"}
        >
          {isCompared ? "✓ 비교중" : "+ 비교"}
        </button>
      )}
    </>
  );
}

interface ComplexHeaderProps {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared?: boolean;
  compareFull?: boolean;
  onToggleCompare?: () => void;
  /** 이름 글자를 보일까 — 소비자 화면은 서버 h1 바로 아래라 false(겹침 방지, 세션 483 PR 3b) · 중개사 작업 머리는 기본 true */
  showName?: boolean;
  /** ★·비교 버튼을 이 줄에 둘까 — 소비자 화면은 서버 h1 옆으로 옮겨 false(세션 483 PR 3b) · 중개사 작업 머리는 기본 true */
  showActions?: boolean;
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
  showName = true,
  showActions = true,
}: ComplexHeaderProps) {
  return (
    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
      {/* 터치 44px: 패딩+동치 음수마진 = 히트영역만 확장, 레이아웃 불변 (세션 299) */}
      <button type="button" onClick={onBack} aria-label="이전 페이지" className="px-3.5 py-2 -mx-3.5 -my-2 text-gray-500 hover:text-gray-600 text-xl rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        ←
      </button>
      {/* h1 은 서버 껍데기(app/complex/[no]/page.tsx) 하나뿐 — 여기는 일반 글자(세션 483 PR 3b · 결정 25) */}
      {showName && <p className="text-lg md:text-2xl font-bold truncate">{complex.complex_name}</p>}
      {showActions && (
        <FavoriteCompareButtons
          name={complex.complex_name}
          starred={starred}
          onToggleFavorite={onToggleFavorite}
          isCompared={isCompared}
          compareFull={compareFull}
          onToggleCompare={onToggleCompare}
        />
      )}
      {complex.real_estate_type_name && (
        <Badge variant="outline" className={ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR}>
          {complex.real_estate_type_name}
        </Badge>
      )}
      {/* 매물 목록을 끝까지 받은 시각 — last_crawled_at 은 다른 수집기도 찍어 기준이 아니다 (세션 448) */}
      {complex.articles_crawled_at && (
        <span className="inline-flex text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          매물 업데이트: {formatTimeAgo(complex.articles_crawled_at)}
        </span>
      )}
    </div>
  );
}
