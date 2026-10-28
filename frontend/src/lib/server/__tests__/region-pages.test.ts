/**
 * 지역 페이지 재료 받기(서버 전용, 세션 484 PR 3c-1b · B2) —
 * 모양 아님(5자리·10자리·동 코드가 시군구로 시작) = 백엔드를 부르지 않고 404 · 백엔드 404 = 404(동은 허브에 있으면 허브#동 308) ·
 * 429·5xx = throw · 열쇠 머리 · 하루 revalidate · 플래그 false = 세 장 모두 404 · 옛 코드 = 새 허브 308.
 * 실행: npx vitest run src/lib/server/__tests__/region-pages.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDongPage, fetchRegionHub, fetchSitemapCodes, loadDong, loadHub, loadRegionIndex } from "../region-pages";
import { makeDong, makeHub } from "@/lib/seo/__tests__/region-fixture";

// 전역 test-setup 의 next/navigation 가짜에는 notFound·permanentRedirect 가 없다 — 진짜(digest 를 던짐)를 쓴다
vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

const FAKE_KEY = "test-ssr-key-not-real";

function digestOf(e: unknown): string {
  return typeof e === "object" && e != null ? String((e as { digest?: string }).digest ?? "") : "";
}
const isNotFound = (e: unknown) => digestOf(e).includes("404");
const redirectOf = (e: unknown) => {
  const d = digestOf(e);
  return d.startsWith("NEXT_REDIRECT") ? d : null;
};

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("예외가 나지 않았다");
}

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
});

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe("받기 — 주소·열쇠·revalidate", () => {
  it("허브·동·코드 주소 · 열쇠 머리 · 하루 revalidate", async () => {
    fetchMock.mockImplementation(async () => json(200, makeHub()));
    await fetchRegionHub("30200");
    await fetchDongPage("30200", "3020011800");
    fetchMock.mockImplementation(async () => json(200, { hubs: ["30200"], dongs: [] }));
    await fetchSitemapCodes();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "http://api.test/api/regions/30200/hub",
      "http://api.test/api/regions/30200/dongs/3020011800",
      "http://api.test/api/regions/sitemap-codes",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers).toEqual({ "X-SSR-Key": FAKE_KEY });
      expect(init.next).toEqual({ revalidate: 86400 });
    }
  });

  it("404 = null · 429·500·503 = throw(열쇠 값 0)", async () => {
    fetchMock.mockImplementation(async () => json(404));
    expect(await fetchRegionHub("30200")).toBeNull();
    expect(await fetchDongPage("30200", "3020011800")).toBeNull();
    for (const status of [429, 500, 503]) {
      fetchMock.mockImplementation(async () => json(status));
      const e = await caught(fetchRegionHub("30200"));
      expect(isNotFound(e)).toBe(false);
      expect(String(e)).toContain(`HTTP ${status}`);
      expect(String(e)).not.toContain(FAKE_KEY);
    }
  });

  it("코드 목록은 404 도 throw — 빈 목록을 굳히지 않는다", async () => {
    fetchMock.mockImplementation(async () => json(404));
    expect(String(await caught(fetchSitemapCodes()))).toContain("HTTP 404");
  });
});

describe("loadHub", () => {
  it.each(["abc", "3020", "302000", "3020a", ""])("코드 %j = 백엔드를 부르지 않고 notFound", async (code) => {
    expect(isNotFound(await caught(loadHub(code)))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("백엔드 404 = notFound · 5xx = throw · 200 = 그대로", async () => {
    fetchMock.mockImplementation(async () => json(404));
    expect(isNotFound(await caught(loadHub("00000")))).toBe(true);
    fetchMock.mockImplementation(async () => json(503));
    expect(isNotFound(await caught(loadHub("30200")))).toBe(false);
    fetchMock.mockImplementation(async () => json(200, makeHub()));
    expect((await loadHub("30200")).sigungu_name).toBe("유성구");
  });

  it("플래그 false = 백엔드를 부르지 않고 notFound(v2 O7)", async () => {
    fetchMock.mockImplementation(async () => json(200, makeHub()));
    expect(isNotFound(await caught(loadHub("30200", false)))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("옛 코드 = 새 허브로 영구 이동(308) · 백엔드 안 부름(결정 20)", async () => {
    const e = await caught(loadHub("30100", true, { "30100": "30200" }));
    expect(redirectOf(e)).toContain("/region/30200");
    expect(redirectOf(e)).toContain("308");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadDong", () => {
  it.each([
    ["30200", "302001180"],
    ["30200", "30200118000"],
    ["30200", "3011011800"], // 다른 시군구의 동
    ["3020", "3020011800"],
    ["30200", "abcdefghij"],
  ])("%s / %s = 백엔드를 부르지 않고 notFound", async (sgg, dong) => {
    expect(isNotFound(await caught(loadDong(sgg, dong)))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("200 = 그대로", async () => {
    fetchMock.mockImplementation(async () => json(200, makeDong()));
    expect((await loadDong("30200", "3020011800")).dong_name).toBe("봉명동");
  });

  it("동 페이지 404 인데 허브에 그 동이 있으면 = 허브 안 그 동 묶음으로 308(사라진 옛 주소)", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("/dongs/") ? json(404) : json(200, makeHub())));
    const e = await caught(loadDong("30200", "3020012900"));
    expect(isNotFound(e)).toBe(false);
    expect(redirectOf(e)).toContain("/region/30200#3020012900");
    expect(redirectOf(e)).toContain("308");
  });

  it("허브에도 없는 동 코드 · 없는 시군구 = notFound", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("/dongs/") ? json(404) : json(200, makeHub())));
    expect(isNotFound(await caught(loadDong("30200", "3020099999")))).toBe(true);
    fetchMock.mockImplementation(async () => json(404));
    expect(isNotFound(await caught(loadDong("00000", "0000011100")))).toBe(true);
  });

  it("5xx = throw(404 아님)", async () => {
    fetchMock.mockImplementation(async () => json(500));
    const e = await caught(loadDong("30200", "3020011800"));
    expect(isNotFound(e)).toBe(false);
    expect(String(e)).toContain("HTTP 500");
  });

  it("플래그 false = notFound", async () => {
    fetchMock.mockImplementation(async () => json(200, makeDong()));
    expect(isNotFound(await caught(loadDong("30200", "3020011800", false)))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadRegionIndex", () => {
  it("플래그 false = notFound · true = 이름표 253곳 전부(백엔드 호출 0 — 빌드 때 그려도 백엔드에 기대지 않는다)", async () => {
    expect(isNotFound(await caught(Promise.resolve().then(() => loadRegionIndex(false))))).toBe(true);
    const groups = loadRegionIndex(true);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(253);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it('이 모듈은 첫 줄이 import "server-only"', () => {
  const self = readFileSync(path.resolve(__dirname, "../region-pages.ts"), "utf-8");
  expect(self.split("\n")[0].trim()).toBe('import "server-only";');
});
