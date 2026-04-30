import type { Complex } from "@/types";

/** 단지 목록 클라이언트 정렬 — /search 페이지 */
export function sortComplexes(complexes: Complex[], sortBy: string): Complex[] {
  if (sortBy === "default" || !sortBy) return complexes;
  const sorted = [...complexes];
  switch (sortBy) {
    case "name_desc":
      return sorted.sort((a, b) => (b.complex_name ?? "").localeCompare(a.complex_name ?? "", "ko"));
    case "household_desc":
      return sorted.sort((a, b) => (b.total_household_count ?? 0) - (a.total_household_count ?? 0));
    case "household_asc":
      return sorted.sort((a, b) => (a.total_household_count ?? 0) - (b.total_household_count ?? 0));
    case "year_desc":
      return sorted.sort((a, b) => (b.use_approve_ymd ?? "").localeCompare(a.use_approve_ymd ?? ""));
    case "year_asc":
      return sorted.sort((a, b) => (a.use_approve_ymd ?? "").localeCompare(b.use_approve_ymd ?? ""));
    case "article_desc":
      return sorted.sort((a, b) => (b.article_count ?? 0) - (a.article_count ?? 0));
    default:
      return complexes;
  }
}
