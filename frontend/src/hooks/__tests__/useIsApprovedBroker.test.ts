/**
 * 자동 새로 받기 가드의 승인 판정 (세션 481 보완 F5) — 서버 칸 is_approved_broker 만 본다.
 * 서버 판정 = BE get_approved_user 와 같은 함수(관리자·승인 상태·승인/이용권 기한·ADMIN_USER_IDS).
 * 역할·상태로 추정하지 않는다 — 기한이 지난 approved 회원도 서버가 false 를 주면 false.
 * 실행: npx vitest run src/hooks/__tests__/useIsApprovedBroker.test.ts
 */
import { describe, it, expect } from "vitest";
import { isApprovedBrokerProfile } from "../useIsApprovedBroker";

describe("isApprovedBrokerProfile", () => {
  it("서버가 is_approved_broker=true 를 주면 참", () => {
    expect(isApprovedBrokerProfile({ is_approved_broker: true })).toBe(true);
  });

  it("false·칸 없음·프로필 없음은 거짓 — 역할·상태로 추정하지 않는다", () => {
    expect(isApprovedBrokerProfile({ is_approved_broker: false })).toBe(false);
    // 옛 추정(role expert·status approved)이 있어도 서버 칸이 없으면 거짓
    expect(isApprovedBrokerProfile({ role: "expert", status: "approved" } as never)).toBe(false);
    expect(isApprovedBrokerProfile({})).toBe(false);
    expect(isApprovedBrokerProfile(undefined)).toBe(false);
    expect(isApprovedBrokerProfile(null)).toBe(false);
  });
});
