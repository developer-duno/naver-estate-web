/** 프론트엔드 공유 상수 (백엔드 shared/constants.py와 동기화) */

/** 제곱미터 → 평 변환 계수 */
export const M2_TO_PYEONG = 3.3058;

/** 페이지당 매물 수 */
export const PAGE_SIZE = 50;

/** 크롤링 상태 폴링 간격 (ms) */
export const CRAWL_STATUS_POLL_MS = 2_000;

/** 매물 목록 폴링 간격 (ms) */
export const ARTICLES_POLL_MS = 3_000;

/** 거래유형별 뱃지 색상 */
export const TRADE_TYPE_COLORS: Record<string, string> = {
  "매매": "bg-red-100 text-red-700",
  "전세": "bg-blue-100 text-blue-700",
  "월세": "bg-green-100 text-green-700",
  "단기임대": "bg-yellow-100 text-yellow-700",
};

export const TRADE_TYPE_DEFAULT_COLOR = "bg-gray-100 text-gray-700";

/** 층수 프리셋 */
export const FLOOR_PRESETS: Record<string, { min: number; max?: number }> = {
  "저층": { min: 1, max: 5 },
  "중층": { min: 6, max: 10 },
  "고층": { min: 11 },
};

/** 디바운스 대기 시간 (ms) */
export const DEBOUNCE_MS = 300;

/** 최대 엑셀 내보내기 행 수 */
export const MAX_EXPORT_ROWS = 5000;

/** 정렬 옵션 */
export const SORT_OPTIONS = [
  { v: "rank", l: "기본순" },
  { v: "price_asc", l: "가격↑" },
  { v: "price_desc", l: "가격↓" },
  { v: "area_asc", l: "면적↑" },
  { v: "area_desc", l: "면적↓" },
  { v: "ppyeong_asc", l: "평당가↑" },
  { v: "ppyeong_desc", l: "평당가↓" },
  { v: "maintenance_asc", l: "관리비↑" },
  { v: "maintenance_desc", l: "관리비↓" },
  { v: "confirm_desc", l: "최신순" },
  { v: "confirm_asc", l: "오래된순" },
] as const;

/** 준공년도 필터 옵션 */
export const BUILDING_AGE_OPTIONS = [
  { v: "0", l: "전체" },
  { v: "5", l: "5년 이내" },
  { v: "10", l: "10년 이내" },
  { v: "15", l: "15년 이내" },
  { v: "20", l: "20년 이내" },
  { v: "25", l: "25년 이내" },
  { v: "30", l: "30년 이내" },
] as const;

/** 입주가능일 옵션 */
export const MOVE_IN_OPTIONS = ["전체", "즉시입주", "1개월", "3개월", "6개월", "협의"] as const;
