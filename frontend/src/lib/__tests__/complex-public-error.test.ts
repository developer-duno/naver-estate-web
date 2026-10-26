/**
 * 공개 단지 화면 래퍼 2종(getPublicPriceHistory · getRegionTrend) 에러 전파 가드 — 세션 482 PR 1b.
 * 실패를 빈 목록으로 삼키면 장애가 "자료 없음"으로 위장된다(error-propagation.md §1·§3).
 * 컴포넌트 시험은 래퍼를 모킹하므로 이 회귀를 못 잡는다 — 래퍼 레벨 MSW 가드.
 * 실행: npx vitest run src/lib/__tests__/complex-public-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";
let seenQuery = "";

const server = setupServer(
  http.get(`${API}/api/complexes/ERR/public-price-history`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  http.get(`${API}/api/complexes/OK/public-price-history`, ({ request }) => {
    seenQuery = new URL(request.url).search;
    return HttpResponse.json({ area_m2: 59, months: [], two_year: null, basis: null });
  }),
  http.get(`${API}/api/complexes/ERR/region-trend`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 503 }),
  ),
  http.get(`${API}/api/complexes/OK/region-trend`, () =>
    HttpResponse.json({ region_code: null, region_name: null, source: "s", items: [] }),
  ),
);

let complex: typeof import("@/lib/api/complex");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  complex = await import("@/lib/api/complex");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getPublicPriceHistory", () => {
  it("5xx 이면 reject 한다(빈 months 반환 금지)", async () => {
    await expect(complex.getPublicPriceHistory("ERR", 59)).rejects.toThrow();
  });
  it("자료 없음(200 + months []) 은 그대로 · 면적은 area_m2 로 실어 보낸다", async () => {
    await expect(complex.getPublicPriceHistory("OK", 84)).resolves.toEqual({
      area_m2: 59, months: [], two_year: null, basis: null,
    });
    expect(seenQuery).toBe("?area_m2=84");
    await complex.getPublicPriceHistory("OK", null);
    expect(seenQuery).toBe("");
  });
});

describe("getRegionTrend", () => {
  it("5xx 이면 reject 한다", async () => {
    await expect(complex.getRegionTrend("ERR")).rejects.toThrow();
  });
  it("연결 없음(200 + items []) 은 그대로", async () => {
    await expect(complex.getRegionTrend("OK")).resolves.toMatchObject({ items: [] });
  });
});
