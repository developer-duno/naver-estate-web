/**
 * 의견함 래퍼(submitOpinion) 가드 (세션 433) — 네트워크 층(MSW)에서 확인한다.
 * 컴포넌트 시험의 vi.mock("@/lib/api") 는 래퍼를 건너뛰므로 여기서만 잡히는 것:
 *  - 5xx 를 빈 결과로 삼키지 않고 reject 하는가 (error-propagation.md)
 *  - 하루 한도 429 의 서버 문구를 core.ts 처럼 "요청 한도… N초 후" 로 바꾸지 않고 그대로 두는가
 *  - 토큰이 있을 때만 Authorization 을 싣는가
 * 실행: npx vitest run src/lib/__tests__/opinions-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";
const LIMIT_MSG = "시험용 서버 문구 — 이번 주는 더 받지 않아요"; // 대체 문구(DAILY_LIMIT_FALLBACK)와 글자가 달라야 "서버 문구 보존"을 진짜로 검증한다(검사관 🟠)

let lastAuth: string | null = null;
let lastBody: unknown = null;

const server = setupServer(
  http.post(`${API}/api/opinions`, async ({ request }) => {
    lastAuth = request.headers.get("authorization");
    lastBody = await request.json();
    return HttpResponse.json({ id: 7, received: true, can_reply: lastAuth !== null });
  }),
);

// getApiBase 는 호출 때 env 를 읽지만, 다른 래퍼 시험과 같은 방식(env 스텁 + fresh import)으로 맞춘다
let api: typeof import("@/lib/api/opinions");
let core: typeof import("@/lib/api/core");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  api = await import("@/lib/api/opinions");
  core = await import("@/lib/api/core");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  lastAuth = null;
  lastBody = null;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

const body = { kind: "bug" as const, message: "검색 결과가 안 나와요 열 글자", page_path: "/search" };

describe("submitOpinion — 실패를 삼키지 않는다", () => {
  it("500 이면 reject 한다 (ApiError, statusCode 500)", async () => {
    server.use(
      http.post(`${API}/api/opinions`, () => HttpResponse.json({ detail: "Server error" }, { status: 500 })),
    );
    const err = await api.submitOpinion(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(core.ApiError);
    expect((err as InstanceType<typeof core.ApiError>).statusCode).toBe(500);
  });

  it("429 는 서버 문구를 그대로 담아 reject 한다 (\"N초 후\" 로 바꾸지 않음)", async () => {
    server.use(
      http.post(`${API}/api/opinions`, () =>
        HttpResponse.json({ detail: LIMIT_MSG }, { status: 429, headers: { "Retry-After": "60" } }),
      ),
    );
    const err = await api.submitOpinion(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(core.ApiError);
    expect((err as InstanceType<typeof core.ApiError>).statusCode).toBe(429);
    expect((err as Error).message).toBe(LIMIT_MSG);
  });

  it("422 배열 detail 은 사람이 읽는 문장으로 바꿔 reject 한다", async () => {
    server.use(
      http.post(`${API}/api/opinions`, () =>
        HttpResponse.json({ detail: [{ loc: ["body", "message"], msg: "너무 짧아요" }] }, { status: 422 }),
      ),
    );
    await expect(api.submitOpinion(body)).rejects.toThrow("너무 짧아요");
  });

  it("네트워크 오류는 reject 한다", async () => {
    server.use(http.post(`${API}/api/opinions`, () => HttpResponse.error()));
    await expect(api.submitOpinion(body)).rejects.toThrow();
  });
});

describe("submitOpinion — 정상 응답", () => {
  it("200 응답 모양을 그대로 돌려주고, 토큰이 없으면 Authorization 을 싣지 않는다", async () => {
    await expect(api.submitOpinion(body)).resolves.toEqual({ id: 7, received: true, can_reply: false });
    expect(lastAuth).toBeNull();
    expect(lastBody).toEqual(body);
  });

  it("토큰이 있으면 Bearer 로 싣는다", async () => {
    await expect(api.submitOpinion(body, "tok-123")).resolves.toMatchObject({ can_reply: true });
    expect(lastAuth).toBe("Bearer tok-123");
  });
});
