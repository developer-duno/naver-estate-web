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
import {
  LOCKED_PATHS,
  isLockedPath,
  isPaidServicePaused,
} from "@/lib/locked-paths";

describe("LOCKED_PATHS", () => {
  it("/pricing 을 잠긴 경로로 포함한다", () => {
    expect(LOCKED_PATHS).toContain("/pricing");
  });
});

/**
 * 세션 405 — 배너의 "유료 재개 시 자동 소멸"을 지키는 **실제 배선** 가드.
 *
 * `PaidServicePausedNotice.test.tsx` 는 `locked-paths` 를 통째로 모킹하므로 컴포넌트의
 * 분기만 보고 이 연결선(`isPaidServicePaused` → `isLockedPath("/pricing")` → LOCKED_PATHS)은
 * 못 본다. 그래서 누가 `isPaidServicePaused` 를 `return false` 로 하드코딩하거나 다른 경로를
 * 보도록 바꿔도 그쪽 테스트는 전부 초록이다 — 그 사각을 여기서 모킹 없이 막는다.
 *
 * ⚠ 뮤테이션 검증(세션 405 수행): `isPaidServicePaused` 본문을 `return false;` 로 바꾸면
 * 아래 첫 케이스가 FAIL 한다.
 */
describe("isPaidServicePaused — 결제 중단 판정 (모킹 없음)", () => {
  it("/pricing 이 잠긴 동안에는 true (지금 상태)", () => {
    expect(isPaidServicePaused()).toBe(true);
  });

  it("LOCKED_PATHS 의 /pricing 잠금과 판정이 항상 일치한다", () => {
    // 유료를 재개하며 배열에서 /pricing 을 빼면 이 동치가 배너를 자동으로 끈다.
    expect(isPaidServicePaused()).toBe(isLockedPath("/pricing"));
    expect(isPaidServicePaused()).toBe(
      (LOCKED_PATHS as readonly string[]).includes("/pricing"),
    );
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
