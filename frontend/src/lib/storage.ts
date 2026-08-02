/**
 * localStorage 래퍼 — 검색 히스토리 + 즐겨찾기
 */

const HISTORY_KEY = "search_history";
const FAVORITES_KEY = "favorite_complexes";
const MAX_HISTORY = 10;

// ── 타입 ──

export interface SearchHistoryItem {
  type: "keyword" | "region";
  keyword?: string;
  sido?: string;
  sigungu?: string;
  dong?: string;
  timestamp: number;
}

export interface FavoriteComplex {
  complex_no: string;
  complex_name: string;
  address?: string;
  added_at: number;
}

// ── 공통 쓰기 헬퍼 ──

/**
 * localStorage.setItem 안전 래퍼 — quota 초과/사생활 모드 시 throw 대신 false 반환.
 * try-catch 없이 직접 setItem 하던 곳(toggleFavorite 등)이 quota 초과 시 페이지를 crash 시키던 문제 방어.
 * @returns 저장 성공 시 true, 실패 시 false (호출자는 무시해도 됨 — 메모리 토글은 별도로 진행)
 */
export function safeSetItem(key: string, value: string, context: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    // quota 초과는 브라우저에서 DOMException(QuotaExceededError) — instanceof Error 가 환경 따라
    // false 일 수 있어 메시지만 안전 추출. SSR 가드는 setItem 자체가 catch 로 잡히니 console.warn 만.
    if (typeof window !== "undefined") {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[${context}] 저장 실패: ${message}`);
    }
    return false;
  }
}

// ── 검색 히스토리 ──

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function getSearchHistory(): SearchHistoryItem[] {
  return readJSON<SearchHistoryItem[]>(HISTORY_KEY, []);
}

let _lastTs = 0;
function uniqueTimestamp(): number {
  const now = Date.now();
  _lastTs = now <= _lastTs ? _lastTs + 1 : now;
  return _lastTs;
}

export function addSearchHistory(item: Omit<SearchHistoryItem, "timestamp">): void {
  const history = getSearchHistory();
  // 중복 제거 (같은 키워드 또는 같은 지역)
  const deduplicated = history.filter((h) => {
    if (item.type === "keyword" && h.type === "keyword") return h.keyword !== item.keyword;
    if (item.type === "region" && h.type === "region") {
      return !(h.sido === item.sido && h.sigungu === item.sigungu && h.dong === item.dong);
    }
    return true;
  });
  const entry: SearchHistoryItem = { ...item, timestamp: uniqueTimestamp() };
  const updated = [entry, ...deduplicated].slice(0, MAX_HISTORY);
  safeSetItem(HISTORY_KEY, JSON.stringify(updated), "SearchHistory");
}

export function removeSearchHistory(timestamp: number): void {
  const updated = getSearchHistory().filter((h) => h.timestamp !== timestamp);
  safeSetItem(HISTORY_KEY, JSON.stringify(updated), "SearchHistory");
}

export function clearSearchHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

// ── 즐겨찾기 ──

export function getFavorites(): FavoriteComplex[] {
  return readJSON<FavoriteComplex[]>(FAVORITES_KEY, []);
}

export function isFavorite(complexNo: string): boolean {
  return getFavorites().some((f) => f.complex_no === complexNo);
}

export function toggleFavorite(complex: Omit<FavoriteComplex, "added_at">): boolean {
  const favorites = getFavorites();
  const exists = favorites.findIndex((f) => f.complex_no === complex.complex_no);
  if (exists >= 0) {
    favorites.splice(exists, 1);
    // 저장 실패해도 메모리 토글 의도(제거)는 그대로 반환 — 별표 UI 일관성 (safeSetItem 반환 무시)
    safeSetItem(FAVORITES_KEY, JSON.stringify(favorites), "Favorites");
    return false; // 제거됨
  }
  favorites.unshift({ ...complex, added_at: Date.now() });
  safeSetItem(FAVORITES_KEY, JSON.stringify(favorites), "Favorites");
  return true; // 추가됨
}

// ── 미분양 즐겨찾기 ──

const MB_FAVORITES_KEY = "mb_favorites";
const MAX_MB_FAVORITES = 200;

export interface MbFavoriteApartment {
  id: string;
  name: string;
  region?: string;
  added_at: number;
}

export function getMbFavorites(): MbFavoriteApartment[] {
  return readJSON<MbFavoriteApartment[]>(MB_FAVORITES_KEY, []);
}

export function isMbFavorite(id: string): boolean {
  return getMbFavorites().some((f) => f.id === id);
}

export function toggleMbFavorite(item: Omit<MbFavoriteApartment, "added_at">): boolean {
  const favorites = getMbFavorites();
  const idx = favorites.findIndex((f) => f.id === item.id);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    try { localStorage.setItem(MB_FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* quota */ }
    return false;
  }
  const updated = [{ ...item, added_at: Date.now() }, ...favorites].slice(0, MAX_MB_FAVORITES);
  try { localStorage.setItem(MB_FAVORITES_KEY, JSON.stringify(updated)); } catch { /* quota */ }
  return true;
}

// ── 미분양 검색 히스토리 ──

const MB_HISTORY_KEY = "mb_search_history";
const MAX_MB_HISTORY = 10;

export interface MbSearchHistoryItem {
  region: string;
  gu?: string;
  keyword?: string;
  timestamp: number;
}

export function getMbSearchHistory(): MbSearchHistoryItem[] {
  return readJSON<MbSearchHistoryItem[]>(MB_HISTORY_KEY, []);
}

export function addMbSearchHistory(item: Omit<MbSearchHistoryItem, "timestamp">): void {
  if (!item.region || item.region.trim().length === 0) return;
  const cleaned = {
    region: item.region,
    gu: item.gu?.trim() || undefined,
    keyword: item.keyword?.trim() || undefined,
  };
  try {
    const history = getMbSearchHistory();
    const deduplicated = history.filter(
      (h) =>
        !(h.region === cleaned.region && (h.gu ?? "") === (cleaned.gu ?? "") && (h.keyword ?? "") === (cleaned.keyword ?? "")),
    );
    const entry: MbSearchHistoryItem = { ...cleaned, timestamp: uniqueTimestamp() };
    const updated = [entry, ...deduplicated].slice(0, MAX_MB_HISTORY);
    safeSetItem(MB_HISTORY_KEY, JSON.stringify(updated), "MbSearchHistory");
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbSearchHistory] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbSearchHistory(timestamp: number): void {
  const updated = getMbSearchHistory().filter((h) => h.timestamp !== timestamp);
  safeSetItem(MB_HISTORY_KEY, JSON.stringify(updated), "MbSearchHistory");
}

export function clearMbSearchHistory(): void {
  localStorage.removeItem(MB_HISTORY_KEY);
}

// ── 미분양 비교 히스토리 (자동 저장) ──

const MB_COMPARE_HISTORY_KEY = "mb_compare_history";
const MAX_MB_COMPARE_HISTORY = 10;

export interface MbCompareHistoryItem {
  ids: string[];
  names: string[];
  timestamp: number;
}

/** ids를 정렬한 문자열로 비교 세트 동일성 판별 */
export function compareSetKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

export function getMbCompareHistory(): MbCompareHistoryItem[] {
  return readJSON<MbCompareHistoryItem[]>(MB_COMPARE_HISTORY_KEY, []);
}

export function addMbCompareHistory(item: Omit<MbCompareHistoryItem, "timestamp">): void {
  if (!item.ids || item.ids.length < 2) return;
  try {
    const history = getMbCompareHistory();
    const key = compareSetKey(item.ids);
    const deduplicated = history.filter((h) => compareSetKey(h.ids) !== key);
    const entry: MbCompareHistoryItem = { ...item, timestamp: uniqueTimestamp() };
    const updated = [entry, ...deduplicated].slice(0, MAX_MB_COMPARE_HISTORY);
    safeSetItem(MB_COMPARE_HISTORY_KEY, JSON.stringify(updated), "MbCompareHistory");
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbCompareHistory] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbCompareHistory(timestamp: number): void {
  const updated = getMbCompareHistory().filter((h) => h.timestamp !== timestamp);
  safeSetItem(MB_COMPARE_HISTORY_KEY, JSON.stringify(updated), "MbCompareHistory");
}

export function clearMbCompareHistory(): void {
  localStorage.removeItem(MB_COMPARE_HISTORY_KEY);
}

// ── 미분양 비교 북마크 (수동 저장) ──

const MB_COMPARE_BOOKMARK_KEY = "mb_compare_bookmarks";
const MAX_MB_COMPARE_BOOKMARKS = 20;

export interface MbCompareBookmarkItem {
  ids: string[];
  names: string[];
  label?: string;
  saved_at: number;
}

export function getMbCompareBookmarks(): MbCompareBookmarkItem[] {
  return readJSON<MbCompareBookmarkItem[]>(MB_COMPARE_BOOKMARK_KEY, []);
}

export function addMbCompareBookmark(item: Omit<MbCompareBookmarkItem, "saved_at">): void {
  if (!item.ids || item.ids.length < 2) return;
  try {
    const bookmarks = getMbCompareBookmarks();
    const key = compareSetKey(item.ids);
    // 동일 비교 세트가 이미 있으면 라벨만 업데이트
    const idx = bookmarks.findIndex((b) => compareSetKey(b.ids) === key);
    if (idx >= 0) {
      bookmarks[idx] = { ...bookmarks[idx], label: item.label, names: item.names };
      safeSetItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(bookmarks), "MbCompareBookmark");
      return;
    }
    const entry: MbCompareBookmarkItem = {
      ...item,
      label: item.label || item.names.join(" vs "),
      saved_at: uniqueTimestamp(),
    };
    const updated = [entry, ...bookmarks].slice(0, MAX_MB_COMPARE_BOOKMARKS);
    safeSetItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(updated), "MbCompareBookmark");
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbCompareBookmark] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbCompareBookmark(saved_at: number): void {
  const updated = getMbCompareBookmarks().filter((b) => b.saved_at !== saved_at);
  safeSetItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(updated), "MbCompareBookmark");
}

export function clearMbCompareBookmarks(): void {
  localStorage.removeItem(MB_COMPARE_BOOKMARK_KEY);
}

// ── 레이더 차트 설정 (축 선택 + 가중치 영속화) ──

const MB_RADAR_SETTINGS_KEY = "mb_radar_settings";

export interface MbRadarSettings {
  enabledAxes: string[];
  weights: Record<string, number>;
}

/** 모든 축 활성, 가중치 3 (균등) */
export const DEFAULT_RADAR_SETTINGS: MbRadarSettings = {
  enabledAxes: ["units", "parking", "maxFloor", "jeonse", "nearby", "discount", "unsold", "pp", "far", "airQuality", "medical", "childcare", "safety"],
  weights: { units: 3, parking: 3, maxFloor: 3, jeonse: 3, nearby: 3, discount: 3, unsold: 3, pp: 3, far: 3, airQuality: 3, medical: 3, childcare: 3, safety: 3 },
};

/** localStorage에서 레이더 설정 조회 — 방어적 merge로 새 축 자동 대응 */
export function getMbRadarSettings(): MbRadarSettings {
  const raw = readJSON<Partial<MbRadarSettings>>(MB_RADAR_SETTINGS_KEY, {});
  return {
    enabledAxes: Array.isArray(raw.enabledAxes) && raw.enabledAxes.length >= 3
      ? raw.enabledAxes
      : DEFAULT_RADAR_SETTINGS.enabledAxes,
    weights: { ...DEFAULT_RADAR_SETTINGS.weights, ...(raw.weights ?? {}) },
  };
}

/** 레이더 설정 저장 */
export function saveMbRadarSettings(settings: MbRadarSettings): void {
  try {
    localStorage.setItem(MB_RADAR_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbRadarSettings] Failed to save: ${err.message}`);
    }
  }
}

/** 레이더 설정 초기화 */
export function clearMbRadarSettings(): void {
  localStorage.removeItem(MB_RADAR_SETTINGS_KEY);
}

// ── 매물 즐겨찾기 (localStorage) ──

const FAVORITE_ARTICLES_KEY = "favorite_articles";

export interface FavoriteArticle {
  article_no: string;
  complex_no: string;
  complex_name?: string;
  trade_type_name?: string;
  price?: string;
  added_at: number;
}

export function getFavoriteArticles(): FavoriteArticle[] {
  return readJSON<FavoriteArticle[]>(FAVORITE_ARTICLES_KEY, []);
}

export function isArticleFavorite(articleNo: string): boolean {
  return getFavoriteArticles().some((f) => f.article_no === articleNo);
}

/** 토글 — 추가되면 true, 제거되면 false */
export function toggleFavoriteArticle(article: Omit<FavoriteArticle, "added_at">): boolean {
  const favorites = getFavoriteArticles();
  const idx = favorites.findIndex((f) => f.article_no === article.article_no);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    // 저장 실패해도 메모리 토글 의도(제거)는 그대로 반환 — 별표 UI 일관성 (safeSetItem 반환 무시)
    safeSetItem(FAVORITE_ARTICLES_KEY, JSON.stringify(favorites), "FavoriteArticles");
    return false;
  }
  favorites.unshift({ ...article, added_at: Date.now() });
  safeSetItem(FAVORITE_ARTICLES_KEY, JSON.stringify(favorites), "FavoriteArticles");
  return true;
}

// ── 매물 카드 보기 모양 (compact/medium/large) ──

const ARTICLE_VIEW_MODE_KEY = "article_view_mode";
export type ArticleViewMode = "compact" | "medium" | "large";
const VIEW_MODES: readonly ArticleViewMode[] = ["compact", "medium", "large"];

export function getArticleViewMode(): ArticleViewMode {
  const raw = readJSON<string>(ARTICLE_VIEW_MODE_KEY, "medium");
  return (VIEW_MODES as readonly string[]).includes(raw) ? (raw as ArticleViewMode) : "medium";
}

export function setArticleViewMode(mode: ArticleViewMode): void {
  try { localStorage.setItem(ARTICLE_VIEW_MODE_KEY, JSON.stringify(mode)); } catch { /* private mode quota 무시 */ }
}

// ── 한 페이지당 매물 개수 (10/20/30/50) ──

const ARTICLE_PAGE_SIZE_KEY = "article_page_size";
export type ArticlePageSize = 10 | 20 | 30 | 50;
const PAGE_SIZES: readonly ArticlePageSize[] = [10, 20, 30, 50];

export function getArticlePageSize(): ArticlePageSize {
  const raw = readJSON<number>(ARTICLE_PAGE_SIZE_KEY, 10);
  return (PAGE_SIZES as readonly number[]).includes(raw) ? (raw as ArticlePageSize) : 10;
}

export function setArticlePageSize(size: ArticlePageSize): void {
  try { localStorage.setItem(ARTICLE_PAGE_SIZE_KEY, JSON.stringify(size)); } catch { /* private mode quota 무시 */ }
}

// ── 미분양 탭 보기 방식 (list/map) ──

const MB_VIEW_MODE_KEY = "mb_view_mode";
export type MbViewMode = "list" | "map";
const MB_VIEW_MODES: readonly MbViewMode[] = ["list", "map"];

export function getMbViewMode(): MbViewMode {
  const raw = readJSON<string>(MB_VIEW_MODE_KEY, "list");
  return (MB_VIEW_MODES as readonly string[]).includes(raw) ? (raw as MbViewMode) : "list";
}

export function setMbViewMode(mode: MbViewMode): void {
  try { localStorage.setItem(MB_VIEW_MODE_KEY, JSON.stringify(mode)); } catch { /* private mode quota 무시 */ }
}

// ── 즐겨찾기 단지 가격 변동 배지 (최소버전 — 서버 인프라 0, 승인 중개사 전용) ──
// FEATURE_BACKLOG_2026-08.md 항목2 3단계: 발송 채널·서버 이전 결정 전에도 낼 수 있는
// "재방문 시 변동 배지" — getPriceStats(B2 게이트)로 조회한 대표가를 여기 저장해두고
// 다음 방문 때 대조. 이 값 자체는 표시용 캐시일 뿐 원본 데이터가 아니므로 유실돼도 무해.

const FAVORITE_PRICE_SNAPSHOT_KEY = "favorite_price_snapshot";

/** complex_no → 마지막으로 본 대표가(만원). null 이면 "가격 정보 없음"으로 확인된 상태. */
export type FavoritePriceSnapshot = Record<string, number | null>;

export function getFavoritePriceSnapshot(): FavoritePriceSnapshot {
  return readJSON<FavoritePriceSnapshot>(FAVORITE_PRICE_SNAPSHOT_KEY, {});
}

export function saveFavoritePriceSnapshot(snapshot: FavoritePriceSnapshot): void {
  try {
    localStorage.setItem(FAVORITE_PRICE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch { /* private mode quota 무시 */ }
}
