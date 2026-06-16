/**
 * B2 데이터 게이트 단계1 래퍼 가드 (세션 313)
 * — getArticles/getPriceStats 가 accessToken 을 Authorization 헤더로 전달하고,
 *   403(승인 권한 거부)을 api-direct 폴백으로 삼키지 않고 ApiError(403) 로 rethrow 하는지.
 *   (삼키면 승인 안내 UX 분기가 prod 에서 영영 도달 불가 — error-propagation.md)
 * 실행: npx vitest run src/lib/__tests__/b2-gate-token.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

// 폴백 경로 감시용 — 실제 Supabase 호출 차단
vi.mock("@/lib/api-direct", () => ({
  getArticlesDirect: vi.fn().mockResolvedValue({ articles: [], total: 0, page: 1, page_size: 50 }),
}));

// 캡처된 Authorization 헤더 (토큰 전달 검증용)
let capturedAuth: string | null = null;

const server = setupServer(
  // 승인 중개사(토큰 동반) → 200
  http.get(`${API}/api/complexes/200OK/articles`, ({ request }) => {
    capturedAuth = request.headers.get("Authorization");
    return HttpResponse.json({ articles: [{ article_no: "A1" }], total: 1, page: 1, page_size: 50 });
  }),
  // 비로그인·미승인 → 403
  http.get(`${API}/api/complexes/FORBID/articles`, () =>
    HttpResponse.json({ detail: "관리자 승인이 필요합니다" }, { status: 403 }),
  ),
  // 5xx 는 기존대로 폴백
  http.get(`${API}/api/complexes/ERR500/articles`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 }),
  ),
  // price-stats 403
  http.get(`${API}/api/complexes/FORBID/price-stats`, () =>
    HttpResponse.json({ detail: "관리자 승인이 필요합니다" }, { status: 403 }),
  ),
);

let getArticles: typeof import("@/lib/api/articles").getArticles;
let getPriceStats: typeof import("@/lib/api/analytics").getPriceStats;
let directMock: { getArticlesDirect: ReturnType<typeof vi.fn> };

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  ({ getArticles } = await import("@/lib/api/articles"));
  ({ getPriceStats } = await import("@/lib/api/analytics"));
  directMock = (await import("@/lib/api-direct")) as unknown as {
    getArticlesDirect: ReturnType<typeof vi.fn>;
  };
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  directMock.getArticlesDirect.mockClear();
  capturedAuth = null;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getArticles — B2 게이트 토큰·403 전파", () => {
  it("accessToken 을 Authorization Bearer 헤더로 전달한다", async () => {
    await getArticles("200OK", { page: 1, page_size: 50 }, "my-token");
    expect(capturedAuth).toBe("Bearer my-token");
  });

  it("403(승인 권한 거부)은 ApiError(403) 로 rethrow 하고 api-direct 폴백을 타지 않는다", async () => {
    const err = (await getArticles("FORBID", undefined, "tok").catch((e) => e)) as Error & {
      statusCode?: number;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(403);
    expect(directMock.getArticlesDirect).not.toHaveBeenCalled();
  });

  it("5xx 는 기존대로 api-direct 폴백을 탄다 (403 만 rethrow)", async () => {
    const result = (await getArticles("ERR500", undefined, "tok")) as { total: number };
    expect(result.total).toBe(0); // 폴백 반환값
    expect(directMock.getArticlesDirect).toHaveBeenCalledTimes(1);
  });
});

describe("getPriceStats — B2 게이트 403 전파", () => {
  it("403 은 ApiError(403) 로 reject 한다 (빈 데이터로 삼키지 않음)", async () => {
    const err = (await getPriceStats("FORBID", "tok").catch((e) => e)) as Error & {
      statusCode?: number;
    };
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(403);
  });
});
