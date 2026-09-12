/**
 * 잠긴 페이지 경로 판정 테스트 — 세션 400 무료 전환.
 *
 * `isLockedPath` 는 proxy.ts 가 리다이렉트 여부를 고르는 기준이라, 판정이 느슨하면
 * 무관한 경로까지 홈으로 튕기고(오탐) 빡빡하면 하위 경로가 그대로 열린다(누락).
 * proxy.ts 자체는 next/server 의존 때문에 jsdom 단위 테스트가 어려워, 판정 로직만
 * 순수 함수로 떼어 여기서 가드한다.
 *
 * ⚠ 뮤테이션 검증: `pathname.startsWith(`${locked}/`)` 를 `pathname.startsWith(locked)`
 * 로 되돌리면 "이름이 겹치는 다른 경로" 케이스가 실패한다.
 */
import { describe, it, expect } from "vitest";
import { LOCKED_PATHS, isLockedPath } from "@/lib/locked-paths";

describe("LOCKED_PATHS", () => {
  it("/pricing 을 잠긴 경로로 포함한다", () => {
    expect(LOCKED_PATHS).toContain("/pricing");
  });
});

describe("isLockedPath — 잠긴 경로 판정", () => {
  it("정확히 일치하면 true", () => {
    expect(isLockedPath("/pricing")).toBe(true);
  });

  it("하위 경로도 true (잠긴 화면의 모든 자식 경로 차단)", () => {
    expect(isLockedPath("/pricing/")).toBe(true);
    expect(isLockedPath("/pricing/anything")).toBe(true);
    expect(isLockedPath("/pricing/a/b/c")).toBe(true);
  });

  it("이름이 겹치기만 하는 다른 경로는 false (startsWith 오탐 방지)", () => {
    expect(isLockedPath("/pricing-x")).toBe(false);
    expect(isLockedPath("/pricings")).toBe(false);
    expect(isLockedPath("/pricingfoo")).toBe(false);
  });

  it("무관한 공개 경로는 false", () => {
    expect(isLockedPath("/")).toBe(false);
    expect(isLockedPath("/blog")).toBe(false);
    expect(isLockedPath("/tools/property-tax")).toBe(false);
    expect(isLockedPath("/admin")).toBe(false);
  });

  it("경로 중간에 들어간 경우는 false (접두만 판정)", () => {
    expect(isLockedPath("/blog/pricing")).toBe(false);
    expect(isLockedPath("/help/pricing/faq")).toBe(false);
  });

  it("대소문자는 그대로 비교한다 (Next.js 라우팅이 대소문자 구분)", () => {
    expect(isLockedPath("/Pricing")).toBe(false);
    expect(isLockedPath("/PRICING")).toBe(false);
  });
});
