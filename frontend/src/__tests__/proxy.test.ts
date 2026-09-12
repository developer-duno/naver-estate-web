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
 * 인증·관리자 분기는 Supabase 목이 필요해 여기서 다루지 않는다(기존 테스트 선례 0).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

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
