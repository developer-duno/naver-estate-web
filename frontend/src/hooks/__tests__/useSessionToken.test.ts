/**
 * useSessionToken 훅 테스트 — Supabase getSession + onAuthStateChange 갱신 구독 + tokenError
 * 실행: npx vitest run src/hooks/__tests__/useSessionToken.test.ts
 *
 * 갱신 구독 테스트(TOKEN_REFRESHED/SIGNED_OUT/unsubscribe)는 세션 395 사후검증에서
 * CONFIRMED 된 결함의 회귀 가드다 — 훅이 마운트 시 1회만 getSession() 하고 갱신을
 * 구독하지 않아, 화면을 1시간 넘게 열어두면 만료 토큰으로 재조회가 나가 401(승인
 * 중개사에게 "승인 필요" 잠금 카드)이 떴다.
 * 뮤테이션 검증 완료: 훅의 onAuthStateChange 구독 블록을 제거하면
 * "TOKEN_REFRESHED 시 새 토큰 반영"·"SIGNED_OUT 시 undefined"·"언마운트 시 unsubscribe"
 * 3건이 FAIL 한다(구현 복원 후 재통과 확인).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getSessionMock = vi.fn();
const unsubscribeMock = vi.fn();
/** 훅이 onAuthStateChange 에 등록한 콜백 — 테스트에서 직접 호출해 갱신 이벤트를 흉내낸다. */
let authCallback: ((event: string, session: { access_token?: string } | null) => void) | undefined;

const onAuthStateChangeMock = vi.fn((cb: (event: string, session: { access_token?: string } | null) => void) => {
  authCallback = cb;
  return { data: { subscription: { unsubscribe: unsubscribeMock } } };
});

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: getSessionMock, onAuthStateChange: onAuthStateChangeMock },
  }),
}));

import { useSessionToken } from "../useSessionToken";

describe("useSessionToken", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    unsubscribeMock.mockReset();
    onAuthStateChangeMock.mockClear();
    authCallback = undefined;
    // 기본값: 비로그인(구독 경합 테스트가 아닌 케이스가 매달리지 않게)
    getSessionMock.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSession 성공 시 sessionToken 에 access_token 저장", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "abc-token" } } });
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.sessionToken).toBe("abc-token"));
    expect(result.current.tokenError).toBe(false);
  });

  it("getSession 실패 시 tokenError = true, sessionToken = undefined", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error("auth down"));
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenError).toBe(true));
    expect(result.current.sessionToken).toBeUndefined();
    consoleError.mockRestore();
  });

  it("dismissTokenError 호출 시 tokenError = false", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error("auth down"));
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenError).toBe(true));
    act(() => {
      result.current.dismissTokenError();
    });
    expect(result.current.tokenError).toBe(false);
    consoleError.mockRestore();
  });

  it("TOKEN_REFRESHED 이벤트 시 새 액세스 토큰으로 갱신된다 (1시간 뒤 만료토큰 401 차단)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "old-token" } } });
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenReady).toBe(true));
    expect(onAuthStateChangeMock).toHaveBeenCalled();

    act(() => {
      authCallback?.("TOKEN_REFRESHED", { access_token: "fresh-token" });
    });
    await waitFor(() => expect(result.current.sessionToken).toBe("fresh-token"));
  });

  it("SIGNED_IN 이벤트 시 세션 토큰이 채워진다", async () => {
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenReady).toBe(true));
    expect(result.current.sessionToken).toBeUndefined();

    act(() => {
      authCallback?.("SIGNED_IN", { access_token: "signed-in-token" });
    });
    await waitFor(() => expect(result.current.sessionToken).toBe("signed-in-token"));
  });

  it("SIGNED_OUT 이벤트 시 sessionToken = undefined", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "abc-token" } } });
    const { result } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.sessionToken).toBe("abc-token"));

    act(() => {
      authCallback?.("SIGNED_OUT", null);
    });
    await waitFor(() => expect(result.current.sessionToken).toBeUndefined());
  });

  it("언마운트 시 구독을 해제한다 (리스너 누수 방지)", async () => {
    const { result, unmount } = renderHook(() => useSessionToken());
    await waitFor(() => expect(result.current.tokenReady).toBe(true));
    expect(unsubscribeMock).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("구독이 먼저 토큰을 주면 늦게 끝난 getSession() 이 덮어쓰지 않는다 (경합 가드)", async () => {
    // getSession 을 수동 resolve 로 붙잡아 두고, 그 사이 구독이 새 토큰을 배달하는 상황.
    let resolveSession: ((v: unknown) => void) | undefined;
    getSessionMock.mockReturnValue(new Promise((res) => { resolveSession = res; }));

    const { result } = renderHook(() => useSessionToken());
    act(() => {
      authCallback?.("TOKEN_REFRESHED", { access_token: "fresh-token" });
    });
    await waitFor(() => expect(result.current.sessionToken).toBe("fresh-token"));

    // 뒤늦게 도착한 초기 getSession 결과(낡은 토큰)는 무시돼야 한다.
    await act(async () => {
      resolveSession?.({ data: { session: { access_token: "stale-token" } } });
    });
    expect(result.current.sessionToken).toBe("fresh-token");
  });

  it("구독이 먼저 토큰을 준 뒤 늦게 실패한 getSession() 은 tokenError 를 세우지 않는다 (경합 가드 대칭)", async () => {
    // 위 케이스의 reject 버전 — 구독(INITIAL_SESSION 등)이 유효 토큰을 배달한 정상 로그인
    // 상태에서 늦게 끝난 getSession() 이 실패해도 /complex 오류 배너가 뜨면 안 된다(세션 396).
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectSession: ((e: unknown) => void) | undefined;
    getSessionMock.mockReturnValue(new Promise((_, rej) => { rejectSession = rej; }));

    const { result } = renderHook(() => useSessionToken());
    act(() => {
      authCallback?.("INITIAL_SESSION", { access_token: "live-token" });
    });
    await waitFor(() => expect(result.current.sessionToken).toBe("live-token"));
    expect(result.current.tokenReady).toBe(true);

    await act(async () => {
      rejectSession?.(new Error("late failure"));
    });
    expect(result.current.tokenError).toBe(false);
    expect(result.current.sessionToken).toBe("live-token");
    consoleError.mockRestore();
  });
});
