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

/** 매물유형별 뱃지 색상 */
export const ESTATE_TYPE_COLORS: Record<string, string> = {
  "아파트": "bg-teal-50 border-teal-300 text-teal-700",
  "아파트분양권": "bg-orange-50 border-orange-300 text-orange-700",
  "오피스텔": "bg-purple-50 border-purple-300 text-purple-700",
  "오피스텔분양권": "bg-pink-50 border-pink-300 text-pink-700",
  "재건축": "bg-amber-50 border-amber-300 text-amber-700",
  "재개발": "bg-rose-50 border-rose-300 text-rose-700",
};

export const ESTATE_TYPE_DEFAULT_COLOR = "bg-gray-50 border-gray-300 text-gray-600";

/** 매물유형 탭 (네이버 API 코드 기준 — 홈/검색 페이지용) */
export const ESTATE_TYPE_TABS = [
  { code: "APT", label: "아파트" },
  { code: "ABYG", label: "아파트분양권" },
  { code: "JGC", label: "재건축" },
  { code: "OPST", label: "오피스텔" },
  { code: "OBYG", label: "오피스텔분양권" },
  { code: "RDV", label: "재개발" },
] as const;

/** 매물유형 필터 옵션 (FilterBar 드롭다운용 — 매물 레벨 필터) */
export const ESTATE_TYPE_FILTER_OPTIONS = [
  { code: "apt", label: "아파트" },
  { code: "opst", label: "오피스텔" },
  { code: "presale", label: "분양권" },
  { code: "jgc", label: "재건축" },
  { code: "rdv", label: "재개발" },
] as const;

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

/** 프리셋 타입 */
export interface RangePreset {
  label: string;
  min?: number;
  max?: number;
}

/** 가격 프리셋 (만원 단위) — 데스크톱 앱 동기화 */
export const PRICE_PRESETS: RangePreset[] = [
  { label: "전체" },
  { label: "~3억", max: 30000 },
  { label: "3~6억", min: 30000, max: 60000 },
  { label: "6~9억", min: 60000, max: 90000 },
  { label: "9~12억", min: 90000, max: 120000 },
  { label: "12~15억", min: 120000, max: 150000 },
  { label: "15억~", min: 150000 },
];

/** 면적 프리셋 (m² 단위) — 데스크톱 앱 동기화 */
export const AREA_PRESETS: RangePreset[] = [
  { label: "전체" },
  { label: "~59m²", max: 60 },
  { label: "59m²", min: 59, max: 60 },
  { label: "84m²", min: 84, max: 85 },
  { label: "114m²", min: 114, max: 115 },
  { label: "135m²~", min: 135 },
];

/** 관리비 프리셋 (만원 단위) — 데스크톱 앱 동기화 */
export const MAINTENANCE_PRESETS: RangePreset[] = [
  { label: "전체" },
  { label: "~5만", max: 5 },
  { label: "5~10만", min: 5, max: 10 },
  { label: "10~20만", min: 10, max: 20 },
  { label: "20만~", min: 20 },
];

/** 평당가 프리셋 (만원/평 단위) — 데스크톱 앱 동기화 */
export const PPYEONG_PRESETS: RangePreset[] = [
  { label: "전체" },
  { label: "~2천만", max: 2000 },
  { label: "2~3천만", min: 2000, max: 3000 },
  { label: "3~4천만", min: 3000, max: 4000 },
  { label: "4~5천만", min: 4000, max: 5000 },
  { label: "5천만~", min: 5000 },
];
