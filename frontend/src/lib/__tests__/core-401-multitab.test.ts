/**
 * fetchApi 401 처리 — 멀티탭 토큰 갱신 경합 오탐 방어 가드 (세션 351)
 *
 * 배경: 같은 사이트를 여러 탭에서 열면 각 탭이 localStorage 의 같은 refresh token 으로
 * 동시에 갱신을 시도한다. 서버는 먼저 온 요청만 허용하고 나중 요청은 거부하는데
 * (supabase/auth-js#213), 그 401 을 그대로 믿고 로그아웃하면 멀쩡히 로그인된 탭까지
 * "로그인 화면으로 튕기는" 결함이 된다.
 *
 * 수정 동작: 401 을 받으면 supabase.auth.getSession() 으로 로컬 세션이 진짜 죽었는지
 * 재확인한 뒤에만 signOut + /login 리다이렉트한다.
 *  - session 있음(경합 오탐) → 로그아웃하지 않고 ApiError(401) 만 전파
 *  - session 없음(진짜 만료)  → 기존대로 로그아웃 (이 케이스 유지가 회귀 방지의 핵심)
 *
 * 실행: npx vitest run src/lib/__tests__/core-401-multitab.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

// Supabase 클라이언트 모킹 — getSession 반환값을 케이스마다 갈아끼운다
const getSessionMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock, signOut: signOutMock },
  }),
}));

const server = setupServer(
  http.get(`${API}/api/me`, () => HttpResponse.json({ detail: "인증이 필요합니다" }, { status: 401 })),
);

/** window.location.href 대입을 가로채 리다이렉트 발생 여부를 관찰 */
let hrefSetter: import("vitest").Mock<(v: string) => void>;
const originalLocation = window.location;

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  server.listen({ onUnhandledRequest: "bypass" });
});

beforeEach(() => {
  hrefSetter = vi.fn();
  const stub = {
    ...originalLocation,
    set href(v: string) {
      hrefSetter(v);
    },
    get href() {
      return "";
    },
  } as unknown as Location;
  Object.defineProperty(window, "location", { configurable: true, value: stub });
});

afterEach(() => {
  server.resetHandlers();
  getSessionMock.mockReset();
  signOutMock.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

/** core.ts 의 HAS_BACKEND·_isLoggingOut 이 모듈 상태라 케이스마다 fresh import (article-live-404.test.ts 답습) */
async function freshFetchApi() {
  vi.resetModules();
  const mod = await import("@/lib/api/core");
  return mod.fetchApi as <T>(path: string, options?: RequestInit) => Promise<T>;
}

describe("fetchApi 401 — 멀티탭 경합 오탐 방어", () => {
  it("세션이 살아있으면 401 이어도 로그아웃/리다이렉트하지 않는다 (경합 오탐)", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "still-valid", user: { id: "u1" } } },
      error: null,
    });
    const fetchApi = await freshFetchApi();

    const err = (await fetchApi("/api/me").catch((e) => e)) as Error & { statusCode?: number };

    // 401 은 그대로 호출자에게 전파돼 각자의 에러 UI 가 처리한다
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(401);
    // 핵심 단언: 강제 로그아웃·리다이렉트가 일어나지 않아야 한다
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("세션이 실제로 없으면 기존대로 로그아웃 + /login 리다이렉트 (기존 동작 유지)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const fetchApi = await freshFetchApi();

    const err = (await fetchApi("/api/me").catch((e) => e)) as Error & { statusCode?: number };

    expect(err.statusCode).toBe(401);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(hrefSetter).toHaveBeenCalledWith("/login");
  });

  it("세션 없는 401 이 동시 2건이어도 signOut 은 1회만 (_isLoggingOut 뮤텍스 유지)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const fetchApi = await freshFetchApi();

    await Promise.all([
      fetchApi("/api/me").catch(() => {}),
      fetchApi("/api/me").catch(() => {}),
    ]);

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
