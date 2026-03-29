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

function readJSON<T>(key: string, fallback: T): T {
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
