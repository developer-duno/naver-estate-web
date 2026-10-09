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

describe("sitemap — 공개 대표 URL 만 (세션 458 SEO)", () => {
  it("계산기 허브 /tools 가 들어 있고, 잠긴·비공개 경로(/pricing·/search·/complex·/mibunyang·/admin)는 없다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const urls = (await sitemap()).map((x) => x.url);
    expect(urls).toContain("https://2u.pe.kr/tools");
    // 경로 머리글자로 판정 — 블로그 글 주소(/blog/mibunyang-…)는 비공개 경로가 아니다
    const paths = urls.map((u) => new URL(u).pathname);
    for (const bad of ["/pricing", "/search", "/complex", "/mibunyang", "/admin", "/login"]) {
      expect(paths.some((p) => p === bad || p.startsWith(`${bad}/`))).toBe(false);
    }
  });
});
