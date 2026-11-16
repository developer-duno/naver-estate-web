/**
 * sitemap — /updates("고쳤습니다") 의 lastModified (세션 437 PR C)
 * 가장 최근 공개 항목의 published_at 을 쓰고, 실패·빈 목록·주소 없음이면 고정 날짜(빌드 시각 금지).
 * 실행: npx vitest run src/app/__tests__/sitemap.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sitemap from "../sitemap";

const API = "http://test-api:8000";
const STATIC = new Date("2026-06-29").getTime();
const fetchMock = vi.fn();

async function updatesLastmod() {
  const entries = await sitemap();
  const e = entries.find((x) => x.url.endsWith("/updates"));
  expect(e).toBeDefined();
  return new Date(e!.lastModified as Date).getTime();
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sitemap /updates lastModified", () => {
  it("첫 항목(가장 최근 공개)의 published_at 을 쓴다", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: 2, public_title: "t", public_answer: "a", status: "fixed", published_at: "2026-10-05T01:02:03+00:00" },
            { id: 1, public_title: "t", public_answer: "a", status: "fixed", published_at: "2026-09-01T00:00:00+00:00" },
          ],
          total: 2,
          page: 1,
        }),
        { status: 200 },
      ),
    );
    expect(await updatesLastmod()).toBe(Date.parse("2026-10-05T01:02:03+00:00"));
  });

  it("실패하면 고정 날짜", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect(await updatesLastmod()).toBe(STATIC);
  });

  it("빈 목록이면 고정 날짜", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1 }), { status: 200 }));
    expect(await updatesLastmod()).toBe(STATIC);
  });

  it("백엔드 주소가 없으면 부르지 않고 고정 날짜", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(await updatesLastmod()).toBe(STATIC);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sitemap — 정적 장 lastModified 는 장마다 실제로 바뀐 날 (세션 507)", () => {
  // 옛 코드는 정적 장 전부가 한 날짜(2026-06-29)를 썼다 — 홈 제목이 바뀌어도 lastmod 가 그대로였다.
  it("정적 장들이 서로 다른 날짜를 갖고, 홈은 도움말보다 나중에 바뀌었다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    // "지금"을 먼 미래로 고정한다 — 실제 오늘 날짜에 기대면 오늘 고친 장(날짜 = 오늘)이 "빌드 시각"으로 오판된다(세션 508).
    const FROZEN_NOW = new Date("2030-01-01T00:00:00Z").getTime();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW);
    try {
      // 날짜 표가 모듈을 불러올 때 계산되면 고정 전에 이미 읽힌다 — 고정 뒤 새로 불러온다(적대검증 🟠3)
      vi.resetModules();
      const { default: freshSitemap } = await import("../sitemap");
      const entries = await freshSitemap();
      const byPath = new Map(entries.map((e) => [new URL(e.url).pathname, new Date(e.lastModified as Date).getTime()]));
      const statics = ["/", "/broker", "/tools", "/tools/second-mortgage", "/tools/brokerage-fee", "/tools/acquisition-tax",
        "/tools/transfer-tax", "/tools/property-tax", "/tools/area-converter", "/help", "/terms", "/privacy",
        // 세션 513 — 체크 목록 장(lastmod = checklists.ts checkedAt)
        "/broker/jeonse",
        // 세션 514 — 계약 체크 목록 모음 장 + 세입자·집주인 장
        "/checklist", "/checklist/jeonse-tenant", "/checklist/jeonse-landlord"];
      const times = statics.map((p) => byPath.get(p));
      expect(times.every((t) => typeof t === "number" && !Number.isNaN(t))).toBe(true);
      expect(new Set(times).size).toBeGreaterThan(1);
      // 세션 513: /terms·/privacy 도 2026-11-16 에 고쳐 홈과 같은 날이 됐다 → 비교 상대를 /help 로
      expect(byPath.get("/")!).toBeGreaterThan(byPath.get("/help")!);
      expect(byPath.get("/privacy")!).toBe(new Date("2026-11-16").getTime());
      expect(byPath.get("/terms")!).toBe(new Date("2026-11-16").getTime());
      expect(byPath.get("/broker/jeonse")!).toBe(new Date("2026-11-16").getTime());
      expect(byPath.get("/checklist")!).toBe(new Date("2026-11-16").getTime());
      expect(byPath.get("/checklist/jeonse-tenant")!).toBe(new Date("2026-11-16").getTime());
      expect(byPath.get("/checklist/jeonse-landlord")!).toBe(new Date("2026-11-16").getTime());
      // 빌드 시각을 쓰지 않는다 — 어느 정적 장도 고정한 "지금"(2030-01-01)이 아니다
      expect(times.every((t) => FROZEN_NOW - (t as number) > 24 * 3600 * 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("/blog 는 공개 글 중 가장 최근 발행일", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const entries = await sitemap();
    const blog = entries.find((e) => new URL(e.url).pathname === "/blog");
    const posts = entries.filter((e) => new URL(e.url).pathname.startsWith("/blog/"));
    const latest = Math.max(...posts.map((e) => new Date(e.lastModified as Date).getTime()));
    expect(new Date(blog!.lastModified as Date).getTime()).toBe(latest);
  });
});

describe("sitemap — 공개 대표 URL 만 (세션 458 SEO)", () => {
  // 단지·지역 주소는 이 파일이 아니라 /sitemaps/complexes.xml·/sitemaps/regions.xml 에 있다(세션 485 PR 3c-2)
  it("계산기 허브 /tools 가 들어 있고, 잠긴·비공개 경로(/pricing·/search·/complex·/mibunyang·/admin)는 없다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const urls = (await sitemap()).map((x) => x.url);
    expect(urls).toContain("https://2u.pe.kr/tools");
    // 세션 511 — 「중개 실무」 공개 장
    expect(urls).toContain("https://2u.pe.kr/broker");
    // 세션 513 — 체크 목록 장은 checklists.ts 한 목록에서 나온다
    expect(urls).toContain("https://2u.pe.kr/broker/jeonse");
    // 세션 514 — 당사자용 목록은 /checklist/<type> 에만, /broker/<type> 은 중개사용만
    expect(urls).toContain("https://2u.pe.kr/checklist");
    expect(urls).toContain("https://2u.pe.kr/checklist/jeonse-tenant");
    expect(urls).toContain("https://2u.pe.kr/checklist/jeonse-landlord");
    expect(urls).not.toContain("https://2u.pe.kr/broker/jeonse-tenant");
    expect(urls).not.toContain("https://2u.pe.kr/checklist/jeonse");
    // 경로 머리글자로 판정 — 블로그 글 주소(/blog/mibunyang-…)는 비공개 경로가 아니다
    const paths = urls.map((u) => new URL(u).pathname);
    for (const bad of ["/pricing", "/search", "/complex", "/mibunyang", "/admin", "/login"]) {
      expect(paths.some((p) => p === bad || p.startsWith(`${bad}/`))).toBe(false);
    }
  });
});
