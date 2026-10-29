/**
 * 단지·지역 사이트맵(세션 485 PR 3c-2, 설계 pr3c §2-4 + v2 R1·O7·Y8) —
 * 정상 XML(`<loc>` 만) · XML 이스케이프 · 실패/빈 목록/모양 이상 = 503 + Retry-After + no-store ·
 * 상한 초과 = 500 + no-store · 200 머리 s-maxage=86400 · 열쇠 머리 · 지역 스위치 false = 503 · route 는 force-dynamic.
 * 실행: npx vitest run src/lib/server/__tests__/sitemaps.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as complexesRoute from "@/app/sitemaps/complexes.xml/route";
import * as regionsRoute from "@/app/sitemaps/regions.xml/route";
import { SITEMAP_URL_LIMIT, escapeXml, regionsSitemapResponse, urlsetXml } from "../sitemaps";

const FAKE_KEY = "test-ssr-key-not-real";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  vi.stubEnv("SSR_SHARED_KEY", FAKE_KEY);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

/** 실패 응답 공통 단언 — 503 + Retry-After + no-store + 본문 없음 */
async function expectUnavailable(res: Response) {
  expect(res.status).toBe(503);
  expect(res.headers.get("Retry-After")).toBe("3600");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(await res.text()).toBe("");
}

describe("route 설정 — 요청 때 그린다(v2 R1)", () => {
  it("두 route 모두 dynamic=force-dynamic · revalidate 를 내보내지 않는다", () => {
    expect(complexesRoute.dynamic).toBe("force-dynamic");
    expect(regionsRoute.dynamic).toBe("force-dynamic");
    expect("revalidate" in complexesRoute).toBe(false);
    expect("revalidate" in regionsRoute).toBe(false);
  });
});

describe("XML 만들기", () => {
  it("& < > \" ' 를 이스케이프한다", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });

  it("urlset 에 <loc> 만(lastmod 없음) · 주소 안의 & 는 &amp;", () => {
    const xml = urlsetXml(["/complex/7", "/x?a=1&b=2"]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(locs(xml)).toEqual(["https://2u.pe.kr/complex/7", "https://2u.pe.kr/x?a=1&amp;b=2"]);
    expect(xml).not.toContain("lastmod");
  });
});

describe("단지 사이트맵 /sitemaps/complexes.xml", () => {
  it("정상 — 등급 A 주소 · 열쇠 머리 · 200 머리(xml · s-maxage 하루)", async () => {
    fetchMock.mockResolvedValue(json(200, { grade: "A", count: 3, items: ["7", "16", "21"] }));
    const res = await complexesRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=3600");
    const xml = await res.text();
    expect(locs(xml)).toEqual(["https://2u.pe.kr/complex/7", "https://2u.pe.kr/complex/16", "https://2u.pe.kr/complex/21"]);
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/complexes/sitemap-ids?grade=A");
    expect((init as RequestInit).headers).toEqual({ "X-SSR-Key": FAKE_KEY });
  });

  it("비 2xx(429·500) = 503", async () => {
    for (const status of [429, 500]) {
      fetchMock.mockResolvedValueOnce(json(status));
      await expectUnavailable(await complexesRoute.GET());
    }
  });

  it("네트워크 실패 = 503", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectUnavailable(await complexesRoute.GET());
  });

  it("빈 목록 = 503(빈 사이트맵 200 금지)", async () => {
    fetchMock.mockResolvedValue(json(200, { grade: "A", count: 0, items: [] }));
    await expectUnavailable(await complexesRoute.GET());
  });

  it("모양 이상(items 없음 · 숫자 아님) = 503", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { grade: "A" }));
    await expectUnavailable(await complexesRoute.GET());
    fetchMock.mockResolvedValueOnce(json(200, { items: ["7", "a&b"] }));
    await expectUnavailable(await complexesRoute.GET());
  });

  it("백엔드 주소가 없으면 부르지 않고 503", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    await expectUnavailable(await complexesRoute.GET());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("상한 = 50,000 · 정확히 상한이면 200, 상한+1 이면 500 + no-store + 로그 한 줄", async () => {
    expect(SITEMAP_URL_LIMIT).toBe(50000);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
    fetchMock.mockResolvedValueOnce(json(200, { items: ids(SITEMAP_URL_LIMIT) }));
    expect((await complexesRoute.GET()).status).toBe(200);

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json(200, { items: ids(SITEMAP_URL_LIMIT + 1) }));
    const res = await complexesRoute.GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe("지역 사이트맵 /sitemaps/regions.xml", () => {
  it("정상 — /region 1줄 + 허브 + 동(동 주소의 시군구 = 동 코드 앞 5자리) · 열쇠 머리 · 200 머리", async () => {
    fetchMock.mockResolvedValue(json(200, { hubs: ["11110", "30200"], dongs: ["3020011800"] }));
    const res = await regionsRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=3600");
    expect(locs(await res.text())).toEqual([
      "https://2u.pe.kr/region",
      "https://2u.pe.kr/region/11110",
      "https://2u.pe.kr/region/30200",
      "https://2u.pe.kr/region/30200/3020011800",
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/regions/sitemap-codes");
    expect((init as RequestInit).headers).toEqual({ "X-SSR-Key": FAKE_KEY });
  });

  it("비 2xx(404·500)·네트워크 실패 = 503", async () => {
    fetchMock.mockResolvedValueOnce(json(404));
    await expectUnavailable(await regionsRoute.GET());
    fetchMock.mockResolvedValueOnce(json(500));
    await expectUnavailable(await regionsRoute.GET());
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expectUnavailable(await regionsRoute.GET());
  });

  it("빈 목록(허브·동 둘 다 0) = 503", async () => {
    fetchMock.mockResolvedValue(json(200, { hubs: [], dongs: [] }));
    await expectUnavailable(await regionsRoute.GET());
  });

  it("모양 이상(동 없음 · 자릿수 다름) = 503", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { hubs: ["11110"] }));
    await expectUnavailable(await regionsRoute.GET());
    fetchMock.mockResolvedValueOnce(json(200, { hubs: ["1111"], dongs: [] }));
    await expectUnavailable(await regionsRoute.GET());
  });

  it("주소 수(/region 포함)가 상한+1 이면 500 + no-store", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hubs = Array.from({ length: SITEMAP_URL_LIMIT }, (_, i) => String(10000 + (i % 90000)).padStart(5, "0"));
    fetchMock.mockResolvedValue(json(200, { hubs, dongs: [] }));
    const res = await regionsRoute.GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("스위치 false(REGION_PAGES_ENABLED 또는 REGION_PAGES_INDEX) = 백엔드를 부르지 않고 503", async () => {
    fetchMock.mockResolvedValue(json(200, { hubs: ["11110"], dongs: [] }));
    await expectUnavailable(await regionsSitemapResponse({ enabled: false, index: true }));
    await expectUnavailable(await regionsSitemapResponse({ enabled: true, index: false }));
    expect(fetchMock).not.toHaveBeenCalled();
    // 기본값(지금 둘 다 켜짐)은 200
    expect((await regionsSitemapResponse()).status).toBe(200);
  });

  it("기본값은 색인 스위치 상수를 따른다 — REGION_PAGES_INDEX 를 false 로 되돌리면 route 가 503(되돌리기 O7 · 검사관 🟡2)", async () => {
    fetchMock.mockResolvedValue(json(200, { hubs: ["11110"], dongs: [] }));
    vi.resetModules();
    vi.doMock("@/lib/seo/region-page", async (orig) => ({ ...(await orig<object>()), REGION_PAGES_INDEX: false }));
    try {
      const route = await import("@/app/sitemaps/regions.xml/route");
      await expectUnavailable(await route.GET());
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/lib/seo/region-page");
      vi.resetModules();
    }
  });
});
