/**
 * proxy(미들웨어) 잠긴 페이지 리다이렉트 테스트 — 세션 400 무료 전환.
 *
 * `isLockedPath` 단위 테스트(lib/__tests__/locked-paths.test.ts)는 "판정"만 보고,
 * 이 테스트는 그 판정이 실제로 **리다이렉트 응답으로 이어지는지**를 본다
 * (import 는 됐지만 분기 위치가 틀려 무동작하는 경우를 잡는다).
 *
 * ⚠ 이 테스트 환경엔 NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 가 없어 proxy 가 세션 조회
 * 앞에서 조기 return 한다. 그래서 잠금 분기는 그 env 가드보다 **앞**에 있어야 하고,
 * 이 테스트가 바로 그 순서를 고정한다 — 분기를 env 가드 뒤로 옮기면 실패한다
 * (뮤테이션 검증 완료: 뒤로 옮기면 200 이 나와 FAIL).
 *
 * 관리자 분기(세션 417)는 아래 별도 describe 에서 `@supabase/ssr` 를 목으로 바꿔 다룬다.
 * 목은 파일 전체에 걸리지만, 위 잠금 테스트는 Supabase env 가 없어 목에 닿기 전에 return 하므로 영향 0.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// getUser() 가 돌려줄 사용자 — 테스트마다 바꿔 끼운다
const supa = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: supa.user } }) },
  }),
}));

describe("proxy — 잠긴 페이지(/pricing) 차단", () => {
  it("/pricing 요청은 홈으로 리다이렉트한다", async () => {
    const res = await proxy(new NextRequest("https://2u.pe.kr/pricing"));

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://2u.pe.kr/");
  });

  it("하위 경로(/pricing/foo)도 홈으로 리다이렉트한다", async () => {
    const res = await proxy(new NextRequest("https://2u.pe.kr/pricing/foo"));

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://2u.pe.kr/");
  });

  it("로그인 후 잠긴 화면에 도달하지 않게 redirect 파라미터를 남기지 않는다", async () => {
    const res = await proxy(new NextRequest("https://2u.pe.kr/pricing"));

    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("redirect");
    expect(location).not.toContain("/login");
  });

  it("이름이 겹치는 다른 경로(/pricing-x)는 리다이렉트하지 않는다", async () => {
    const res = await proxy(new NextRequest("https://2u.pe.kr/pricing-x"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("무관한 공개 경로(/blog)는 리다이렉트하지 않는다", async () => {
    const res = await proxy(new NextRequest("https://2u.pe.kr/blog"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("proxy — 관리자 경로(/admin)는 user_id 로만 판정 (세션 417)", () => {
  const OWNER_ID = "b0da4fd4-487d-46a9-8b3b-cff07227429c";

  function stubSupabaseEnv() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    supa.user = null;
  });

  it("user.id 가 ADMIN_USER_IDS 에 있으면 통과한다", async () => {
    stubSupabaseEnv();
    vi.stubEnv("ADMIN_USER_IDS", `other-id, ${OWNER_ID}`);
    supa.user = { id: OWNER_ID, email: "owner@test.com" };

    const res = await proxy(new NextRequest("https://2u.pe.kr/admin"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("옛 ADMIN_EMAIL 과 같은 이메일이어도 user.id 가 목록에 없으면 홈으로 보낸다", async () => {
    stubSupabaseEnv();
    vi.stubEnv("ADMIN_USER_IDS", OWNER_ID);
    vi.stubEnv("ADMIN_EMAIL", "boss@test.com");
    supa.user = { id: "impostor-id", email: "boss@test.com" };

    const res = await proxy(new NextRequest("https://2u.pe.kr/admin/users"));

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://2u.pe.kr/");
  });

  it("ADMIN_USER_IDS 미설정이면 전원 차단하고 서버 로그에 경고를 남긴다", async () => {
    stubSupabaseEnv();
    vi.stubEnv("ADMIN_USER_IDS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    supa.user = { id: OWNER_ID, email: "owner@test.com" };

    const res = await proxy(new NextRequest("https://2u.pe.kr/admin"));

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://2u.pe.kr/");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ADMIN_USER_IDS 미설정"));
  });

  it("로그인 안 했으면 로그인 화면으로 보낸다(기존 동작 유지)", async () => {
    stubSupabaseEnv();
    vi.stubEnv("ADMIN_USER_IDS", OWNER_ID);
    supa.user = null;

    const res = await proxy(new NextRequest("https://2u.pe.kr/admin"));

    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location")).toBe("https://2u.pe.kr/login?redirect=%2Fadmin");
  });
});
