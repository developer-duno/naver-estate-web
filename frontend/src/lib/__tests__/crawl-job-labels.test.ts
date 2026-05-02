/**
 * crawl-job-labels: job_type 코드 ↔ 한글 라벨 매핑
 * 실행: npx vitest run src/lib/__tests__/crawl-job-labels.test.ts
 */
import { describe, it, expect } from "vitest";
import { jobTypeLabel, jobTypeDesc, CRAWL_JOB_LABELS } from "../crawl-job-labels";

describe("crawl-job-labels", () => {
  it("등록된 코드는 한글 라벨로 변환", () => {
    expect(jobTypeLabel("complex_articles")).toBe("단지 매물 수집");
    expect(jobTypeLabel("price_history")).toBe("시세 이력 수집");
    expect(jobTypeLabel("public_trade_data")).toBe("공공 실거래가 수집");
  });

  it("미등록 코드는 입력 그대로 반환 (안전한 fallback)", () => {
    expect(jobTypeLabel("unknown_type")).toBe("unknown_type");
    expect(jobTypeLabel("")).toBe("");
  });

  it("desc 는 등록된 코드만 반환, 미등록은 빈 문자열", () => {
    expect(jobTypeDesc("complex_articles")).toContain("아파트 단지");
    expect(jobTypeDesc("unknown_type")).toBe("");
  });

  it("BE 의 11개 job_type 모두 매핑 등록됨", () => {
    const expected = [
      "complex_articles", "complex_list", "popular_crawl", "article_detail",
      "price_history", "public_trade_data", "bulk_recrawl",
      "air_quality", "emergency", "childcare", "crime_stats",
    ];
    for (const code of expected) {
      expect(CRAWL_JOB_LABELS[code]).toBeDefined();
      expect(CRAWL_JOB_LABELS[code].label.length).toBeGreaterThan(0);
      expect(CRAWL_JOB_LABELS[code].desc.length).toBeGreaterThan(0);
    }
  });
});
