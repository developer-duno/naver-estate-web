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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

export function removeSearchHistory(timestamp: number): void {
  const updated = getSearchHistory().filter((h) => h.timestamp !== timestamp);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
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
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return false; // 제거됨
  }
  favorites.unshift({ ...complex, added_at: Date.now() });
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
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
    localStorage.setItem(MB_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbSearchHistory] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbSearchHistory(timestamp: number): void {
  const updated = getMbSearchHistory().filter((h) => h.timestamp !== timestamp);
  localStorage.setItem(MB_HISTORY_KEY, JSON.stringify(updated));
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
    localStorage.setItem(MB_COMPARE_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbCompareHistory] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbCompareHistory(timestamp: number): void {
  const updated = getMbCompareHistory().filter((h) => h.timestamp !== timestamp);
  try { localStorage.setItem(MB_COMPARE_HISTORY_KEY, JSON.stringify(updated)); } catch { /* quota */ }
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
      localStorage.setItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(bookmarks));
      return;
    }
    const entry: MbCompareBookmarkItem = {
      ...item,
      label: item.label || item.names.join(" vs "),
      saved_at: uniqueTimestamp(),
    };
    const updated = [entry, ...bookmarks].slice(0, MAX_MB_COMPARE_BOOKMARKS);
    localStorage.setItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(updated));
  } catch (err) {
    if (typeof window !== "undefined" && err instanceof Error) {
      console.warn(`[MbCompareBookmark] Failed to add: ${err.message}`);
    }
  }
}

export function removeMbCompareBookmark(saved_at: number): void {
  const updated = getMbCompareBookmarks().filter((b) => b.saved_at !== saved_at);
  try { localStorage.setItem(MB_COMPARE_BOOKMARK_KEY, JSON.stringify(updated)); } catch { /* quota */ }
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
