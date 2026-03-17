/**
 * Supabase 직접 조회 — 백엔드(FastAPI) 없이 DB에서 직접 읽기
 * 실시간 크롤링은 불가, 기존 DB 데이터만 조회
 */

import { createClient } from "@/lib/supabase";
import type { Complex, Article, DbStats, Regions, FilterOptions, PriceStats } from "@/types";

function sb() {
  return createClient();
}

/** DB 통계 */
export async function getStatsDirect(): Promise<DbStats> {
  const supabase = sb();
  const [complexRes, articleRes] = await Promise.all([
    supabase.from("complexes").select("*", { count: "exact", head: true }),
    supabase.from("articles").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);
  return {
    complex_count: complexRes.count ?? 0,
    
    article_count: articleRes.count ?? 0,
  };
}


// 지역 목록 캐시 (5분 TTL)
let _regionCache: { data: Regions; time: number } | null = null;
const REGION_CACHE_TTL = 5 * 60 * 1000;

/** 지역 목록 */
export async function getRegionsDirect(): Promise<Regions> {
  if (_regionCache && Date.now() - _regionCache.time < REGION_CACHE_TTL) return _regionCache.data;
  const supabase = sb();
  // 47K행 전체 SELECT 대신 페이지네이션으로 모든 지역 조합 수집
  const regions: Record<string, Record<string, string[]>> = {};
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data } = await supabase
      .from("complexes")
      .select("sido, sigungu, dong")
      .not("sido", "is", null)
      .range(from, from + PAGE - 1);

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.sido) continue;
      if (!regions[row.sido]) regions[row.sido] = {};
      if (row.sigungu) {
        if (!regions[row.sido][row.sigungu]) regions[row.sido][row.sigungu] = [];
        if (row.dong && !regions[row.sido][row.sigungu].includes(row.dong)) {
          regions[row.sido][row.sigungu].push(row.dong);
        }
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  _regionCache = { data: regions as Regions, time: Date.now() };
  return regions as Regions;
}

/** 단지 키워드 검색 */
export async function searchComplexesDirect(keyword: string) {
  const supabase = sb();
  const { data, count } = await supabase
    .from("complexes")
    .select("*", { count: "exact" })
    .ilike("complex_name", `%${keyword}%`)
    .limit(50);
  return { complexes: (data ?? []) as Complex[], total: count ?? 0 };
}

/** 지역별 단지 조회 */
export async function getComplexesByRegionDirect(sido: string, sigungu?: string, dong?: string) {
  const supabase = sb();
  let query = supabase.from("complexes").select("*", { count: "exact" }).eq("sido", sido);
  if (sigungu) query = query.eq("sigungu", sigungu);
  if (dong) query = query.eq("dong", dong);
  const { data, count } = await query.limit(200);
  return { complexes: (data ?? []) as Complex[], total: count ?? 0 };
}

/** 단지 상세 */
export async function getComplexDirect(complexNo: string): Promise<Complex> {
  const supabase = sb();
  const { data, error } = await supabase
    .from("complexes")
    .select("*")
    .eq("complex_no", complexNo)
    .single();
  if (error || !data) throw new Error("단지를 찾을 수 없습니다");
  return data as Complex;
}

/** 단지별 매물 조회 */
export async function getArticlesDirect(complexNo: string, filters?: Record<string, unknown>) {
  const supabase = sb();
  let query = supabase
    .from("articles")
    .select("*", { count: "exact" })
    .eq("complex_no", complexNo)
    .eq("is_active", true);

  if (filters?.trade_type) query = query.eq("trade_type_name", filters.trade_type);
  if (filters?.building_name) query = query.eq("building_name", filters.building_name);
  if (filters?.sort_by) {
    const desc = filters.sort_order === "desc";
    query = query.order(String(filters.sort_by), { ascending: !desc });
  } else {
    query = query.order("numeric_price", { ascending: true, nullsFirst: false });
  }

  const page = Number(filters?.page ?? 1);
  const pageSize = Number(filters?.page_size ?? 50);
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count } = await query;
  return {
    articles: (data ?? []) as Article[],
    total: count ?? 0,
    page,
    page_size: pageSize,
  };
}

/** 필터 옵션 */
export async function getFilterOptionsDirect(complexNo: string): Promise<FilterOptions> {
  const supabase = sb();
  const { data } = await supabase
    .from("articles")
    .select("building_name, tags, direction")
    .eq("complex_no", complexNo)
    .eq("is_active", true);

  const buildings = new Set<string>();
  const tagSet = new Set<string>();
  const directions = new Set<string>();

  for (const row of data ?? []) {
    if (row.building_name) buildings.add(row.building_name);
    if (row.direction) directions.add(row.direction);
    if (Array.isArray(row.tags)) row.tags.forEach((t: string) => tagSet.add(t));
  }

  return {
    building_names: [...buildings].sort(),
    tags: [...tagSet].sort(),
    directions: [...directions].sort(),
  };
}

/** 매물 상세 */
export async function getArticleDirect(articleNo: string): Promise<Article> {
  const supabase = sb();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("article_no", articleNo)
    .single();
  if (error || !data) throw new Error("매물을 찾을 수 없습니다");
  return data as Article;
}
