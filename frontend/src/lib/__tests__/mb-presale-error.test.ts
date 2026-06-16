/**
 * 분양 API 래퍼 에러 전파 가드 (세션 314 PR C) — getMbPresale/getMbPresaleDetail/
 * getMbCompetition 이 5xx 를 빈 데이터로 삼키면 React Query isError 가 prod 에서 발화하지
 * 않아 retry/에러 UI 가 dead code 가 된다 (error-propagation.md — 래퍼당 5xx→reject 1건 의무).
 * 컴포넌트 테스트의 vi.mock("@/lib/api") 는 래퍼를 우회하므로 삼킴을 못 잡는다.
 * 실행: npx vitest run src/lib/__tests__/mb-presale-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { vi } from "vitest";

const API = "http://test-api:8000";

const server = setupServer(
  http.get(`${API}/api/mb/presale`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  http.get(`${API}/api/mb/presale/ERR`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  http.get(`${API}/api/mb/competition`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 503 }),
  ),
  // 정상 응답 (200 경로도 한 번 확인)
  http.get(`${API}/api/mb/presale/OK`, () =>
    HttpResponse.json({
      id: "OK",
      name: "정상단지",
      schedules: [],
      unit_supplies: [],
      presale_summary: {
        total_general_supply: 0,
        total_special_supply: 0,
        total_supply: 0,
        special_by_type_total: [],
        unit_type_count: 0,
        schedule_count: 0,
      },
    }),
  ),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let mbApi: typeof import("@/lib/api/mibunyang");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  mbApi = await import("@/lib/api/mibunyang");
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("분양 API 래퍼 에러 전파 (5xx → reject, 삼킴 금지)", () => {
  it("getMbPresale 5xx → reject (빈 배열 삼킴 금지)", async () => {
    await expect(mbApi.getMbPresale("private", "서울")).rejects.toThrow();
  });

  it("getMbPresaleDetail 5xx → reject", async () => {
    await expect(mbApi.getMbPresaleDetail("ERR")).rejects.toThrow();
  });

  it("getMbCompetition 5xx(503) → reject", async () => {
    await expect(mbApi.getMbCompetition("서울")).rejects.toThrow();
  });

  it("getMbPresaleDetail 200 → 정상 파싱 (요약 집계 포함)", async () => {
    const detail = await mbApi.getMbPresaleDetail("OK");
    expect(detail.id).toBe("OK");
    expect(detail.presale_summary.total_supply).toBe(0);
    expect(detail.schedules).toEqual([]);
  });
});
