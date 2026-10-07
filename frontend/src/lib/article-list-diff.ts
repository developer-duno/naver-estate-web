import type { Article } from "@/types";

/** 표 한 페이지 분량의 매물 목록 (getArticles 응답에서 쓰는 두 칸) */
export interface ArticleListSnapshot {
  articles: Article[];
  total: number;
}

export interface ArticleListDiff {
  /** 바뀐 것이 하나라도 있나 (total 이 달라도 바뀜) */
  changed: boolean;
  /** 새 목록에만 있는 매물 + 지금 목록에만 있는 매물 + 양쪽에 있는데 가격이 다른 매물 */
  count: number;
}

// 가격 칸 — 매매가·보증금(deal_or_warrant_prc)·월세(rent_prc) 와 그 숫자판
const PRICE_FIELDS = ["deal_or_warrant_prc", "rent_prc", "numeric_price", "numeric_rent_price"] as const;

function samePrice(a: Article, b: Article): boolean {
  return PRICE_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

/**
 * 크롤이 끝난 뒤 따로 받은 새 목록(next)을 지금 표의 목록(current)과 비교한다 (세션 447).
 * 매물 번호와 가격이 같고 순서만 다르면 "안 바뀜" — 표를 다시 그려 줄 순서만 흔들 필요가 없다.
 */
export function diffArticleLists(
  current: ArticleListSnapshot | undefined,
  next: ArticleListSnapshot,
): ArticleListDiff {
  const cur = new Map((current?.articles ?? []).map((a) => [a.article_no, a]));
  const nxt = new Map(next.articles.map((a) => [a.article_no, a]));

  let count = 0;
  for (const [no, a] of nxt) {
    const old = cur.get(no);
    if (!old) count += 1; // 새 목록에만 있음
    else if (!samePrice(old, a)) count += 1; // 가격이 다름
  }
  for (const no of cur.keys()) {
    if (!nxt.has(no)) count += 1; // 지금 목록에만 있음
  }

  const totalDiff = Math.abs(next.total - (current?.total ?? 0));
  // 이 페이지 매물은 그대로인데 전체 건수만 다르면 그 차이를 센다 ("0건 바뀜" 방지)
  if (count === 0) count = totalDiff;
  return { changed: count > 0, count };
}
