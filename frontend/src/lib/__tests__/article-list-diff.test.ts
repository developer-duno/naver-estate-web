/**
 * diffArticleLists — 크롤 뒤 새 목록이 지금 표와 정말 달라졌나 (세션 447)
 *
 * "바뀜" = 새 목록에만 있는 매물 + 지금 목록에만 있는 매물 + 가격이 다른 매물, total 이 달라도 바뀜.
 * 매물 번호와 가격이 같고 순서만 다르면 "안 바뀜" — 이 경우 표를 다시 그리지 않는다.
 *
 * 실행: npx vitest run src/lib/__tests__/article-list-diff.test.ts
 */
import { describe, it, expect } from "vitest";
import { diffArticleLists, type ArticleListSnapshot } from "../article-list-diff";
import type { Article } from "@/types";

function art(no: string, over: Partial<Article> = {}): Article {
  return {
    article_no: no,
    complex_no: "100",
    deal_or_warrant_prc: "5억",
    rent_prc: "",
    numeric_price: 50000,
    numeric_rent_price: 0,
    ...over,
  };
}

function list(articles: Article[], total = articles.length): ArticleListSnapshot {
  return { articles, total };
}

describe("diffArticleLists", () => {
  it("똑같으면 안 바뀜", () => {
    const a = list([art("1"), art("2"), art("3")]);
    expect(diffArticleLists(a, list([art("1"), art("2"), art("3")]))).toEqual({ changed: false, count: 0 });
  });

  it("순서만 다르면 안 바뀜 (5번째 월세가 3번째로 올라온 경우)", () => {
    const cur = list([art("1"), art("2"), art("3"), art("4"), art("5", { rent_prc: "80" })]);
    const next = list([art("1"), art("2"), art("5", { rent_prc: "80" }), art("3"), art("4")]);
    expect(diffArticleLists(cur, next)).toEqual({ changed: false, count: 0 });
  });

  it("새 매물이 생기면 그 수만큼", () => {
    const cur = list([art("1"), art("2")], 2);
    const next = list([art("1"), art("2"), art("9")], 3);
    expect(diffArticleLists(cur, next)).toEqual({ changed: true, count: 1 });
  });

  it("빠진 매물도 센다", () => {
    const cur = list([art("1"), art("2"), art("3")], 3);
    const next = list([art("1"), art("3")], 2);
    expect(diffArticleLists(cur, next)).toEqual({ changed: true, count: 1 });
  });

  it("같은 번호인데 가격이 다르면 센다 — 매매가·보증금·월세 칸", () => {
    const cur = list([art("1"), art("2"), art("3")]);
    const next = list([
      art("1", { deal_or_warrant_prc: "4억 9,000", numeric_price: 49000 }),
      art("2", { rent_prc: "90", numeric_rent_price: 90 }),
      art("3"),
    ]);
    expect(diffArticleLists(cur, next)).toEqual({ changed: true, count: 2 });
  });

  it("한 페이지 안 매물은 같아도 total 이 다르면 바뀜 — N = total 차이 ('0건 바뀜' 금지)", () => {
    const cur = list([art("1"), art("2")], 32);
    expect(diffArticleLists(cur, list([art("1"), art("2")], 35))).toEqual({ changed: true, count: 3 });
    expect(diffArticleLists(cur, list([art("1"), art("2")], 30))).toEqual({ changed: true, count: 2 });
  });

  it("새 + 빠짐 + 가격 변경을 더한다", () => {
    const cur = list([art("1"), art("2"), art("3")], 3);
    const next = list([art("1", { numeric_price: 51000 }), art("3"), art("7")], 3);
    // 7 새로 생김 + 2 빠짐 + 1 가격 변경 = 3
    expect(diffArticleLists(cur, next)).toEqual({ changed: true, count: 3 });
  });

  it("지금 표가 아직 없으면 새 목록 전부가 바뀜", () => {
    expect(diffArticleLists(undefined, list([art("1"), art("2")]))).toEqual({ changed: true, count: 2 });
  });
});
