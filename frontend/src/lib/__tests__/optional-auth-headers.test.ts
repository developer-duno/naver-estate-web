/**
 * 공개 엔드포인트 래퍼의 로그인 토큰 실어 보내기 (세션 481 공개 전환).
 *
 * BE 는 단지 상세·검색의 비로그인 응답에서 네이버 재료 칸(매물 수·전세가율·크롤 시각 등)을 걷어낸다.
 * 래퍼가 토큰을 안 실으면 로그인 회원도 걷어낸 응답을 받으므로, 래퍼 레벨에서 헤더를 단언한다.
 * 실행: npx vitest run src/lib/__tests__/optional-auth-headers.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

// getSession 이 돌려줄 세션 — 테스트마다 바꿔 끼운다
const supa = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: supa.token ? { access_token: supa.token } : null },
      }),
      signOut: async () => ({}),
    },
  }),
}));

// 폴백(Supabase 직접 조회) 차단 — 백엔드 경로만 본다
vi.mock("@/lib/api-direct", () => ({
  getArticleDirect: vi.fn().mockResolvedValue({ article_no: "DIRECT" }),
  getComplexDirect: vi.fn().mockRejectedValue(new Error("direct fallback")),
  searchComplexesDirect: vi.fn().mockRejectedValue(new Error("direct fallback")),
  getComplexesByRegionDirect: vi.fn().mockRejectedValue(new Error("direct fallback")),
}));

const seen: Record<string, string | null> = {};
const server = setupServer(
  http.get(`${API}/api/complexes/6139`, ({ request }) => {
    seen.detail = request.headers.get("authorization");
    return HttpResponse.json({ complex_no: "6139", complex_name: "테스트" });
  }),
  http.get(`${API}/api/complexes/search`, ({ request }) => {
    seen.dbSearch = request.headers.get("authorization");
    return HttpResponse.json({ complexes: [], total: 0 });
  }),
  http.get(`${API}/api/live/search`, ({ request }) => {
    seen.liveSearch = request.headers.get("authorization");
    return HttpResponse.json({ complexes: [], total: 0 });
  }),
  http.get(`${API}/api/live/region`, ({ request }) => {
    seen.liveRegion = request.headers.get("authorization");
    return HttpResponse.json({ complexes: [], total: 0 });
  }),
  // 매물 상세·가격 이력(세션 481 보완 F1) — 토큰 없으면 401(BE 로그인 게이트와 같게)
  http.get(`${API}/api/live/article/A481/detail`, ({ request }) => {
    seen.articleLive = request.headers.get("authorization");
    return seen.articleLive
      ? HttpResponse.json({ article_no: "A481" })
      : HttpResponse.json({ detail: "인증이 필요합니다" }, { status: 401 });
  }),
  http.get(`${API}/api/complexes/LOCK401`, () =>
    HttpResponse.json({ detail: "인증이 필요합니다" }, { status: 401 })),
  http.get(`${API}/api/complexes/LOCK403`, () =>
    HttpResponse.json({ detail: "정지된 계정입니다" }, { status: 403 })),
  http.get(`${API}/api/articles/A481/price-history`, ({ request }) => {
    seen.articleHistory = request.headers.get("authorization");
    return HttpResponse.json({ article_no: "A481", history: [] });
  }),
);

let api: typeof import("@/lib/api/complex");
let articles: typeof import("@/lib/api/articles");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  api = await import("@/lib/api/complex");
  articles = await import("@/lib/api/articles");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  supa.token = null;
  for (const k of Object.keys(seen)) delete seen[k];
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

async function callAll() {
  await api.getComplex("6139");
  await api.searchComplexesDb("테스트");
  await api.searchComplexes("테스트");
  await api.getComplexesByRegion("서울", "강남구");
}

describe("공개 래퍼 — 로그인 토큰 실어 보내기", () => {
  it("로그인이면 래퍼 4개 모두 Authorization 을 싣는다", async () => {
    supa.token = "tok-481";
    await callAll();
    expect(seen).toEqual({
      detail: "Bearer tok-481",
      dbSearch: "Bearer tok-481",
      liveSearch: "Bearer tok-481",
      liveRegion: "Bearer tok-481",
    });
  });

  it("비로그인이면 Authorization 을 싣지 않는다", async () => {
    supa.token = null;
    await callAll();
    expect(seen).toEqual({ detail: null, dbSearch: null, liveSearch: null, liveRegion: null });
  });
});

describe("매물 래퍼 — 로그인 토큰 · 401 은 폴백 없이 전파 (세션 481 보완 F1)", () => {
  it("로그인이면 getArticleLive·getArticlePriceHistory 가 Authorization 을 싣는다", async () => {
    supa.token = "tok-481";
    expect(await articles.getArticleLive("A481")).toEqual({ article_no: "A481" });
    await articles.getArticlePriceHistory("A481");
    expect(seen.articleLive).toBe("Bearer tok-481");
    expect(seen.articleHistory).toBe("Bearer tok-481");
  });

  it("비로그인 getArticleLive 401 은 Supabase 직접 조회로 뭉개지 않고 ApiError(401) 로 던진다", async () => {
    supa.token = null;
    const err = (await articles.getArticleLive("A481").catch((e) => e)) as Error & { statusCode?: number };
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(401);
  });
});

describe("getComplex — 401·403 은 Supabase 직접 조회로 뭉개지 않는다 (세션 481 보완)", () => {
  it.each([[401, "LOCK401"], [403, "LOCK403"]])("%i 이면 ApiError(%i) 그대로", async (status, no) => {
    const err = (await api.getComplex(no as string).catch((e) => e)) as Error & { statusCode?: number };
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(status);
  });
});
