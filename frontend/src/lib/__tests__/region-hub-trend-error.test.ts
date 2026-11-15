/**
 * getRegionHubTrend(홈 「지역 시세 흐름」 래퍼) 에러 전파 가드 — 세션 508.
 * 실패를 null·빈 목록으로 삼키면 장애가 "자료 없음"으로 위장된다(error-propagation.md §1·§3).
 * 컴포넌트 시험은 래퍼를 모킹하므로 이 회귀를 못 잡는다 — 래퍼 레벨 MSW 가드.
 * 실행: npx vitest run src/lib/__tests__/region-hub-trend-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const server = setupServer(
  http.get(`${API}/api/regions/99999/hub`, () => HttpResponse.json({ detail: "Server error" }, { status: 503 })),
  http.get(`${API}/api/regions/11680/hub`, () =>
    HttpResponse.json({
      sigungu_code: "11680",
      region_trend: { region_code: "11680", region_name: "강남구", source: "한국부동산원", items: [{ period: "202610", sale_price_median: 250000, jeonse_ratio: 40.1 }] },
      dongs: [],
    }),
  ),
  http.get(`${API}/api/regions/11110/hub`, () => HttpResponse.json({ sigungu_code: "11110", region_trend: null, dongs: [] })),
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

describe("getRegionHubTrend", () => {
  it("5xx 이면 reject 한다(null 반환 금지)", async () => {
    await expect(complex.getRegionHubTrend("99999")).rejects.toThrow();
  });
  it("허브의 region_trend 만 돌려준다", async () => {
    const t = await complex.getRegionHubTrend("11680");
    expect(t?.region_name).toBe("강남구");
    expect(t?.items).toHaveLength(1);
  });
  it("지역 통계가 없으면 null", async () => {
    await expect(complex.getRegionHubTrend("11110")).resolves.toBeNull();
  });
});
