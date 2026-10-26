/**
 * 로그인 직후 쿼리 다시 받기 (세션 481 보완 F7).
 *
 * - 세션 없음 → 있음(이 탭·다른 탭 로그인) = 로그인 여부로 달라지는 쿼리 접두사 전부 1회 무효화
 * - 있음 → 있음(auth-js 가 탭 포커스 때 SIGNED_IN 을 다시 보냄) = 무효화 0
 * - SIGNED_OUT = 지금처럼 캐시 전체 비우기
 * 실행: npx vitest run src/components/__tests__/Providers.auth.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  cb: null as null | ((event: string, session: unknown) => void),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.cb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));

const qc = vi.hoisted(() => ({ client: null as null | QueryClient }));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient: QC } = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { makeQueryClient: () => (qc.client = new QC()) };
});
vi.mock("@/components/VersionWatcher", () => ({ default: () => null }));
vi.mock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: () => null }));

import Providers, { LOGIN_DEPENDENT_QUERY_PREFIXES } from "../Providers";

const SESSION = { access_token: "t" };

function setup() {
  render(<Providers><div /></Providers>);
  const client = qc.client!;
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const clear = vi.spyOn(client, "clear");
  return { invalidate, clear };
}

beforeEach(() => {
  auth.cb = null;
});

describe("Providers — 로그인 직후 다시 받기 (세션 481 F7)", () => {
  it("세션 없음 → 있음이면 접두사 전부 1회씩 무효화", () => {
    const { invalidate } = setup();
    auth.cb!("INITIAL_SESSION", null);
    auth.cb!("SIGNED_IN", SESSION);
    expect(invalidate).toHaveBeenCalledTimes(LOGIN_DEPENDENT_QUERY_PREFIXES.length);
    expect(invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey)).toEqual(
      LOGIN_DEPENDENT_QUERY_PREFIXES.map((k) => [...k]),
    );
  });

  it("이미 로그인 상태에서 다시 온 SIGNED_IN(탭 포커스)은 무효화 0", () => {
    const { invalidate } = setup();
    auth.cb!("INITIAL_SESSION", SESSION);
    auth.cb!("SIGNED_IN", SESSION);
    auth.cb!("TOKEN_REFRESHED", SESSION);
    auth.cb!("SIGNED_IN", SESSION);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("로그아웃은 캐시 전체 비우기, 그 뒤 다시 로그인하면 무효화", () => {
    const { invalidate, clear } = setup();
    auth.cb!("INITIAL_SESSION", SESSION);
    auth.cb!("SIGNED_OUT", null);
    expect(clear).toHaveBeenCalledTimes(1);
    auth.cb!("SIGNED_IN", SESSION);
    expect(invalidate).toHaveBeenCalledTimes(LOGIN_DEPENDENT_QUERY_PREFIXES.length);
  });

  it("대상 접두사 = 단지 상세·매물·평형·호가 통계·추이·매물 상세·검색 3종", () => {
    expect(LOGIN_DEPENDENT_QUERY_PREFIXES.map((k) => k[0])).toEqual([
      "complex", "articles", "pyeongDetails", "priceStats", "priceHistory",
      "articleLive", "articlePriceHistory", "search", "complexSearchDb", "regionSearch",
    ]);
  });
});
