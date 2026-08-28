/**
 * getComplexKapt 래퍼 에러 전파 가드 — 공시가격·지하철과 마찬가지로 Supabase direct
 * 폴백 경로가 없다. 다만 이 엔드포인트는 404 가 "데이터 없음"의 확정 답변(K-apt 의무관리
 * 단지가 아닌 대다수 단지)이라 null 로 흡수하고, 그 외 실패는 반드시 전파해야 한다.
 * 삼키면 "서버 장애"가 "관리비 없음"으로 위장돼 React Query isError 가 prod 에서 영영
 * 발화하지 않는다 (error-propagation.md §1·§2, complex-subway-error.test.ts 와 동일 결).
 *
 * ⚠ 컴포넌트 테스트는 vi.mock("@/lib/api/complex") 로 래퍼를 우회하므로 이 회귀를 못 잡는다
 * — 래퍼 레벨 MSW 가드가 별도로 필요한 이유.
 * 실행: npx vitest run src/lib/__tests__/complex-kapt-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const OK_BODY = {
  kapt_code: "A13487001",
  kapt_name: "래미안테스트",
  corridor_type: "계단식",
  cost_month: "202603",
  common_cost: 80_000_000,
  individual_cost: 40_000_000,
  total_cost: 120_000_000,
  cost_per_household: 240_000,
  household_count: 500,
};

const server = setupServer(
  // 5xx — 반드시 reject 되어야 한다 (null 로 삼키면 장애가 "관리비 없음"으로 위장)
  http.get(`${API}/api/complexes/ERR/kapt`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  // 404 — 매칭/관리비 데이터 없음. 다수의 정상 케이스라 null 로 흡수한다
  http.get(`${API}/api/complexes/NONE/kapt`, () =>
    HttpResponse.json({ detail: "K-apt data not found" }, { status: 404 }),
  ),
  // 429 — rate limit 도 삼키면 안 된다
  http.get(`${API}/api/complexes/LIMIT/kapt`, () =>
    HttpResponse.json({ detail: "Too many requests" }, { status: 429 }),
  ),
  // 정상
  http.get(`${API}/api/complexes/OK/kapt`, () => HttpResponse.json(OK_BODY)),
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

describe("getComplexKapt — 실패 삼킴 방지 + 404 만 null 흡수", () => {
  it("500 이면 reject 한다 (null 반환 금지 — 장애를 '관리비 없음'으로 위장하면 안 됨)", async () => {
    await expect(complex.getComplexKapt("ERR")).rejects.toThrow();
  });

  it("429(rate limit) 도 reject 한다", async () => {
    await expect(complex.getComplexKapt("LIMIT")).rejects.toThrow();
  });

  it("404(데이터 없음)는 확정 답변이므로 null 로 반환한다", async () => {
    await expect(complex.getComplexKapt("NONE")).resolves.toBeNull();
  });

  it("정상 응답은 그대로 반환한다", async () => {
    await expect(complex.getComplexKapt("OK")).resolves.toMatchObject({
      kapt_code: "A13487001",
      cost_month: "202603",
      cost_per_household: 240_000,
    });
  });
});
