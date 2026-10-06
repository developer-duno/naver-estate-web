/**
 * 의견함 공개 목록·관리자 래퍼 가드 (세션 437 PR C) — 네트워크 층(MSW)에서 확인한다.
 * 컴포넌트 시험의 vi.mock("@/lib/api") 는 래퍼를 건너뛰므로 여기서만 잡히는 것:
 *  - 5xx 를 빈 목록·가짜 성공으로 삼키지 않고 reject 하는가 (error-propagation.md) — 함수당 1건
 *  - 정상 응답에서 주소·방법·토큰·본문을 서버 계약대로 싣는가
 * 실행: npx vitest run src/lib/__tests__/opinions-admin-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const seen: { method?: string; url?: string; auth?: string | null; body?: unknown } = {};

function remember(request: Request) {
  seen.method = request.method;
  seen.url = request.url;
  seen.auth = request.headers.get("authorization");
}

const server = setupServer(
  http.get(`${API}/api/opinions/public`, ({ request }) => {
    remember(request);
    return HttpResponse.json({ items: [], total: 0, page: 2 });
  }),
  http.get(`${API}/api/admin/opinions`, ({ request }) => {
    remember(request);
    return HttpResponse.json({ items: [], total: 0, page: 1, new_count: 3 });
  }),
  http.patch(`${API}/api/admin/opinions/:id`, async ({ request }) => {
    remember(request);
    seen.body = await request.json();
    return HttpResponse.json({ id: 5, mail_sent: true });
  }),
  http.post(`${API}/api/admin/opinions/:id/resend-mail`, ({ request }) => {
    remember(request);
    return HttpResponse.json({ sent: true });
  }),
  http.delete(`${API}/api/admin/opinions/:id`, ({ request }) => {
    remember(request);
    return HttpResponse.json({ deleted: true });
  }),
);

// 다른 래퍼 시험과 같은 방식(env 스텁 + fresh import)
let api: typeof import("@/lib/api/opinions");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  api = await import("@/lib/api/opinions");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  for (const k of Object.keys(seen)) delete (seen as Record<string, unknown>)[k];
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

const fail500 = () => HttpResponse.json({ detail: "Server error" }, { status: 500 });

describe("의견함 래퍼 — 5xx 는 reject (빈 결과로 삼키지 않음)", () => {
  it("getPublicUpdates", async () => {
    server.use(http.get(`${API}/api/opinions/public`, fail500));
    await expect(api.getPublicUpdates(1)).rejects.toThrow();
  });

  it("getAdminOpinions", async () => {
    server.use(http.get(`${API}/api/admin/opinions`, fail500));
    await expect(api.getAdminOpinions("tok")).rejects.toThrow();
  });

  it("updateAdminOpinion", async () => {
    server.use(http.patch(`${API}/api/admin/opinions/:id`, fail500));
    await expect(api.updateAdminOpinion("tok", 5, { reply: "답" })).rejects.toThrow();
  });

  it("resendOpinionMail", async () => {
    server.use(http.post(`${API}/api/admin/opinions/:id/resend-mail`, fail500));
    await expect(api.resendOpinionMail("tok", 5)).rejects.toThrow();
  });

  it("deleteAdminOpinion", async () => {
    server.use(http.delete(`${API}/api/admin/opinions/:id`, fail500));
    await expect(api.deleteAdminOpinion("tok", 5)).rejects.toThrow();
  });

  it("422 문자열 detail 은 서버 문구 그대로 reject (관리자 화면이 그대로 보여 준다)", async () => {
    server.use(
      http.patch(`${API}/api/admin/opinions/:id`, () =>
        HttpResponse.json({ detail: "공개하려면 공개 제목과 공개 답을 모두 써 주세요" }, { status: 422 }),
      ),
    );
    await expect(api.updateAdminOpinion("tok", 5, { is_public: true })).rejects.toThrow(
      "공개하려면 공개 제목과 공개 답을 모두 써 주세요",
    );
  });
});

describe("의견함 래퍼 — 정상 응답은 서버 계약대로", () => {
  it("getPublicUpdates: ?page= 를 싣고 토큰은 싣지 않는다", async () => {
    await expect(api.getPublicUpdates(2)).resolves.toEqual({ items: [], total: 0, page: 2 });
    expect(new URL(seen.url!).searchParams.get("page")).toBe("2");
    expect(seen.auth).toBeNull();
  });

  it("getAdminOpinions: 상태·쪽 조건과 Bearer 토큰을 싣는다", async () => {
    await expect(api.getAdminOpinions("tok", { status: "new", page: 3 })).resolves.toMatchObject({ new_count: 3 });
    const u = new URL(seen.url!);
    expect(u.searchParams.get("status")).toBe("new");
    expect(u.searchParams.get("page")).toBe("3");
    expect(u.searchParams.has("kind")).toBe(false);
    expect(seen.auth).toBe("Bearer tok");
  });

  it("getAdminOpinions: 종류(kind=error) 조건을 싣는다 (세션 439)", async () => {
    await api.getAdminOpinions("tok", { kind: "error" });
    expect(new URL(seen.url!).searchParams.get("kind")).toBe("error");
  });

  it("updateAdminOpinion: PATCH 로 본문을 그대로 싣는다", async () => {
    await expect(api.updateAdminOpinion("tok", 5, { reply: "고쳤어요" })).resolves.toMatchObject({ mail_sent: true });
    expect(seen.method).toBe("PATCH");
    expect(new URL(seen.url!).pathname).toBe("/api/admin/opinions/5");
    expect(seen.body).toEqual({ reply: "고쳤어요" });
    expect(seen.auth).toBe("Bearer tok");
  });

  it("resendOpinionMail·deleteAdminOpinion: POST·DELETE 와 토큰", async () => {
    await expect(api.resendOpinionMail("tok", 5)).resolves.toEqual({ sent: true });
    expect(seen.method).toBe("POST");
    expect(new URL(seen.url!).pathname).toBe("/api/admin/opinions/5/resend-mail");
    await expect(api.deleteAdminOpinion("tok", 5)).resolves.toEqual({ deleted: true });
    expect(seen.method).toBe("DELETE");
    expect(seen.auth).toBe("Bearer tok");
  });
});
