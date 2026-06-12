/**
 * getArticleLive 404 전파 가드 (세션 297) — backend 404(매물 삭제 확정)는
 * Supabase 폴백으로 삼키지 않고 ApiError(404) 그대로 reject 해야 한다.
 * (폴백 getArticleDirect 는 plain Error 라 ArticleDetail 404 분기가 영영 못 받던 결함의 회귀 방지)
 * 실행: npx vitest run src/lib/__tests__/article-live-404.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

// 폴백 경로 감시용 — 실제 Supabase 호출 차단
vi.mock("@/lib/api-direct", () => ({
  getArticleDirect: vi.fn().mockResolvedValue({ article_no: "FALLBACK" }),
}));

const server = setupServer(
  http.get(`${API}/api/live/article/DEAD01/detail`, () =>
    HttpResponse.json({ detail: "매물 정보를 찾을 수 없습니다" }, { status: 404 }),
  ),
  http.get(`${API}/api/live/article/ERR500/detail`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let getArticleLive: (articleNo: string) => Promise<unknown>;
let directMock: { getArticleDirect: ReturnType<typeof vi.fn> };

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  ({ getArticleLive } = await import("@/lib/api/articles"));
  directMock = (await import("@/lib/api-direct")) as unknown as {
    getArticleDirect: ReturnType<typeof vi.fn>;
  };
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  directMock.getArticleDirect.mockClear();
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getArticleLive — 404 폴백 삼킴 방지", () => {
  it("backend 404 이면 ApiError(404) 로 reject 하고 Supabase 폴백을 타지 않는다", async () => {
    const err = (await getArticleLive("DEAD01").catch((e) => e)) as Error & {
      statusCode?: number;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(404);
    expect(directMock.getArticleDirect).not.toHaveBeenCalled();
  });

  it("404 아닌 에러(500)는 기존대로 Supabase 폴백을 탄다", async () => {
    const result = await getArticleLive("ERR500");
    expect(result).toEqual({ article_no: "FALLBACK" });
    expect(directMock.getArticleDirect).toHaveBeenCalledTimes(1);
  });
});
