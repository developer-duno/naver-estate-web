/**
 * getOfficialPrices 래퍼 에러 전파 가드 (PR-B) — 공시가격은 Supabase direct 폴백 경로가
 * 없으므로 실패를 빈 데이터로 삼키면 안 된다. 삼키면 React Query isError 가 prod 에서
 * 영영 발화하지 않는다 (analytics-error.test.ts·article-live-404.test.ts 와 동일 결).
 * 실행: npx vitest run src/lib/__tests__/official-price-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const server = setupServer(
  http.get(`${API}/api/complexes/ERR/official-prices`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  http.get(`${API}/api/complexes/OK/official-prices`, () =>
    HttpResponse.json({ complex_no: "OK", year: "2026", items: [] }),
  ),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
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

describe("getOfficialPrices — 실패 시 빈 데이터 삼킴 방지", () => {
  it("500 이면 reject 한다 (빈 items 반환 금지)", async () => {
    await expect(complex.getOfficialPrices("ERR")).rejects.toThrow();
  });

  it("정상 응답은 그대로 반환한다", async () => {
    await expect(complex.getOfficialPrices("OK")).resolves.toMatchObject({
      complex_no: "OK",
      year: "2026",
      items: [],
    });
  });
});
