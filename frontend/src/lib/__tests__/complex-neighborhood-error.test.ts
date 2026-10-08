/**
 * getComplexNeighborhood 래퍼 에러 전파 가드 — complex-kapt-error.test.ts 와 같은 결.
 * 404 는 "그 단지의 동네 통계 없음"(행정동 미매핑 등)의 확정 답변이라 null 로 흡수하고,
 * 그 외 실패는 반드시 전파해야 한다. 삼키면 "서버 장애"가 "동네 통계 없음"으로 위장돼
 * 화면의 "동네 통계를 불러오지 못했어요" 안내가 prod 에서 영영 안 뜬다 (error-propagation.md §1·§2).
 *
 * ⚠ 컴포넌트 테스트는 vi.mock("@/lib/api/complex") 로 래퍼를 우회하므로 이 회귀를 못 잡는다.
 * 실행: npx vitest run src/lib/__tests__/complex-neighborhood-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const OK_BODY = {
  emd_cd: "11215850",
  emd_nm: "자양2동",
  year: 2024,
  population: 23116,
  avg_age: 45.4,
  one_person_pct: 36,
  households: 10105,
  one_person_households: 3638,
  house_mix: null,
  old_house_pct: 61,
  old_house_cutoff: "2004년 이전",
  corp_cnt: 1821,
  worker_cnt: 5496,
  broker_pct: null,
  flood: null,
  landslide: null,
  source: "국가데이터처 통계지리정보 센서스 2024, 홍수·산사태 위험지도 2025",
};

const server = setupServer(
  // 5xx — 반드시 reject 되어야 한다 (null 로 삼키면 장애가 "동네 통계 없음"으로 위장)
  http.get(`${API}/api/complexes/ERR/neighborhood`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  // 404 — 동네 통계 없음. 정상 케이스라 null 로 흡수한다
  http.get(`${API}/api/complexes/NONE/neighborhood`, () =>
    HttpResponse.json({ detail: "neighborhood not found" }, { status: 404 }),
  ),
  // 429 — rate limit 도 삼키면 안 된다
  http.get(`${API}/api/complexes/LIMIT/neighborhood`, () =>
    HttpResponse.json({ detail: "Too many requests" }, { status: 429 }),
  ),
  http.get(`${API}/api/complexes/OK/neighborhood`, () => HttpResponse.json(OK_BODY)),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let complex: typeof import("@/lib/api/complex");
let core: typeof import("@/lib/api/core");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  complex = await import("@/lib/api/complex");
  core = await import("@/lib/api/core");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getComplexNeighborhood — 실패 삼킴 방지 + 404 만 null 흡수", () => {
  it("500 이면 reject 한다 — 에러 타입(ApiError·statusCode)도 그대로 보존", async () => {
    const err = await complex.getComplexNeighborhood("ERR").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(core.ApiError);
    expect((err as InstanceType<typeof core.ApiError>).statusCode).toBe(500);
  });

  it("429(rate limit) 도 reject 한다", async () => {
    await expect(complex.getComplexNeighborhood("LIMIT")).rejects.toThrow();
  });

  it("404(동네 통계 없음)는 확정 답변이므로 null 로 반환한다", async () => {
    await expect(complex.getComplexNeighborhood("NONE")).resolves.toBeNull();
  });

  it("정상 응답은 그대로 반환한다", async () => {
    await expect(complex.getComplexNeighborhood("OK")).resolves.toMatchObject({
      emd_nm: "자양2동",
      population: 23116,
      one_person_households: 3638,
    });
  });
});
