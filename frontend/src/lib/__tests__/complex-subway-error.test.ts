/**
 * getComplexSubway 래퍼 에러 전파 가드 — 공시가격과 마찬가지로 Supabase direct 폴백
 * 경로가 없으므로 실패를 빈 stations 로 삼키면 안 된다. 삼키면 React Query isError 가
 * prod 에서 영영 발화하지 않는다 (error-propagation.md §3, official-price-error.test.ts 와 동일 결).
 *
 * ⚠ 컴포넌트 테스트는 vi.mock("@/lib/api/complex") 로 래퍼를 우회하므로 이 회귀를 못 잡는다
 * — 래퍼 레벨 MSW 가드가 별도로 필요한 이유.
 * 실행: npx vitest run src/lib/__tests__/complex-subway-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const server = setupServer(
  // 5xx — 반드시 reject 되어야 한다
  http.get(`${API}/api/complexes/ERR/subway`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  // 404 — 단지 자체가 없는 경우도 에러로 전파되어야 한다
  http.get(`${API}/api/complexes/NOPE/subway`, () =>
    HttpResponse.json({ detail: "Complex not found" }, { status: 404 }),
  ),
  // 정상 — 역 목록 반환
  http.get(`${API}/api/complexes/OK/subway`, () =>
    HttpResponse.json({
      stations: [{ station_name: "강남", lines: ["2호선", "신분당선"], distance_m: 320 }],
    }),
  ),
  // 데이터 없음 = 200 + 빈 배열 (에러 아님)
  http.get(`${API}/api/complexes/EMPTY/subway`, () => HttpResponse.json({ stations: [] })),
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

describe("getComplexSubway — 실패 시 빈 데이터 삼킴 방지", () => {
  it("500 이면 reject 한다 (빈 stations 반환 금지)", async () => {
    await expect(complex.getComplexSubway("ERR")).rejects.toThrow();
  });

  it("404(단지 없음)도 reject 한다", async () => {
    await expect(complex.getComplexSubway("NOPE")).rejects.toThrow();
  });

  it("정상 응답은 그대로 반환한다", async () => {
    await expect(complex.getComplexSubway("OK")).resolves.toMatchObject({
      stations: [{ station_name: "강남", lines: ["2호선", "신분당선"], distance_m: 320 }],
    });
  });

  it("데이터 없음(200 + stations:[]) 은 에러가 아니라 빈 배열로 반환한다", async () => {
    await expect(complex.getComplexSubway("EMPTY")).resolves.toEqual({ stations: [] });
  });
});
