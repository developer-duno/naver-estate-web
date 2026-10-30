/**
 * robots.txt(세션 485 PR 3c-2, 설계 pr3c §2-4 · 결정 14·17·18 · v2 Y4) —
 * 모든 묶음에 공통 차단 전부 · `*` 묶음은 /complex/·/region/ 열림 · 학습 봇 묶음은 둘 다 막힘 · 학습 봇 목록 그대로 · 사이트맵 3개.
 * 실행: npx vitest run src/app/__tests__/robots.test.ts
 */
import { describe, expect, it } from "vitest";
import robots, { AI_TRAINING_BOTS, COMMON_DISALLOW } from "../robots";

const conf = robots();
const rules = Array.isArray(conf.rules) ? conf.rules : [conf.rules];
const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const star = rules.find((r) => r.userAgent === "*")!;
const training = rules.find((r) => Array.isArray(r.userAgent))!;

describe("robots — 공통 차단", () => {
  it("공통 목록 = 옛 목록에서 /complex/ 만 뺀 것(순서 그대로)", () => {
    expect(COMMON_DISALLOW).toEqual([
      "/admin",
      "/admin/",
      "/login",
      "/signup",
      "/forgot-password",
      "/verify",
      "/compare",
      "/mibunyang/compare",
      "/mibunyang/",
      "/search",
      "/pricing",
    ]);
  });

  it("묶음은 둘(`*` · 학습 봇)이고, 모든 묶음이 공통 차단을 전부 갖는다", () => {
    expect(rules).toHaveLength(2);
    for (const r of rules) {
      const dis = asList(r.disallow);
      for (const p of COMMON_DISALLOW) expect(dis).toContain(p);
      // `Allow: /` 를 맨 앞에 두면 처음 맞는 줄을 따르는 해석기가 차단 줄을 못 본다(세션 488) — 어느 묶음에도 allow 를 두지 않는다
      expect(r.allow).toBeUndefined();
    }
  });
});

describe("robots — `*` 묶음", () => {
  it("/complex/·/region/ 은 막지 않는다", () => {
    const dis = asList(star.disallow);
    expect(dis).not.toContain("/complex/");
    expect(dis).not.toContain("/region/");
    expect(dis.some((p) => p.startsWith("/complex") || p.startsWith("/region"))).toBe(false);
  });
  it("차단 목록 = 공통 목록 그대로(사이트 전체 차단 \"/\" 같은 덧붙임 0 · 검사관 🟡1)", () => {
    expect(asList(star.disallow)).toEqual(COMMON_DISALLOW);
  });
});

describe("robots — 학습 봇 묶음(결정 18)", () => {
  it("학습 봇 목록 = 공식 문서 확인 5개 + CCBot(결정 18) 그대로", () => {
    expect(AI_TRAINING_BOTS).toEqual(["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "meta-externalagent", "CCBot"]);
    expect(training.userAgent).toEqual(AI_TRAINING_BOTS);
  });

  it("/complex/·/region/ 을 막는다", () => {
    const dis = asList(training.disallow);
    expect(dis).toContain("/complex/");
    expect(dis).toContain("/region/");
  });

  it("검색·인용 봇은 넣지 않는다", () => {
    for (const bot of ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Googlebot", "Yeti"]) {
      expect(AI_TRAINING_BOTS).not.toContain(bot);
    }
  });
});

describe("robots — 사이트맵·host", () => {
  it("사이트맵 3개 정확히 · host 그대로", () => {
    expect(conf.sitemap).toEqual([
      "https://2u.pe.kr/sitemap.xml",
      "https://2u.pe.kr/sitemaps/complexes.xml",
      "https://2u.pe.kr/sitemaps/regions.xml",
    ]);
    expect(conf.host).toBe("https://2u.pe.kr");
  });
});
