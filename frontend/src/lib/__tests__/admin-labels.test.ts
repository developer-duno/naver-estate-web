/**
 * admin-labels 단위 함수 테스트
 * 실행: npx vitest run src/lib/__tests__/admin-labels.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  ACTION_LABELS,
  TARGET_TYPE_LABELS,
  COLLECTOR_LABELS,
  getActionLabel,
  getTargetLabel,
  getDetailsSummary,
} from "../admin-labels";

describe("admin-labels 매핑 카운트", () => {
  it("ACTION_LABELS = 15개 (BE log_action 호출 답습)", () => {
    expect(Object.keys(ACTION_LABELS)).toHaveLength(15);
  });

  it("TARGET_TYPE_LABELS = 7개 (BE target_type 답습)", () => {
    expect(Object.keys(TARGET_TYPE_LABELS)).toHaveLength(7);
  });

  it("COLLECTOR_LABELS = 5개 (CollectorName Literal 답습)", () => {
    expect(Object.keys(COLLECTOR_LABELS)).toHaveLength(5);
  });
});

describe("getActionLabel", () => {
  it("매핑된 액션은 한글 반환", () => {
    expect(getActionLabel("admin_recrawl_articles")).toBe("매물 일괄 재수집 시작");
    expect(getActionLabel("admin_verify_reject")).toBe("중개사 인증 거부");
    expect(getActionLabel("export")).toBe("엑셀 내보내기");
  });

  it("미정의 액션은 영문 원본 fallback", () => {
    expect(getActionLabel("unknown_action_new")).toBe("unknown_action_new");
  });
});

describe("getTargetLabel", () => {
  it("targetType 없으면 '-'", () => {
    expect(getTargetLabel(undefined, undefined)).toBe("-");
    expect(getTargetLabel("", "123")).toBe("-");
  });

  it("batch + N → 'N건' 형식", () => {
    expect(getTargetLabel("batch", "500")).toBe("배치 500건");
  });

  it("collector + 수집기명 → 한글 collector 라벨", () => {
    expect(getTargetLabel("collector", "backfill-price")).toBe("수집기: 실거래가");
    expect(getTargetLabel("collector", "crime-stats")).toBe("수집기: 범죄통계");
  });

  it("일반 type + id → '타입: id' 형식", () => {
    expect(getTargetLabel("complex", "9138")).toBe("단지: 9138");
    expect(getTargetLabel("verification", "1")).toBe("인증 요청: 1");
  });

  it("id 없으면 type 라벨만", () => {
    expect(getTargetLabel("user", undefined)).toBe("사용자");
  });

  it("미정의 type 은 영문 원본 fallback", () => {
    expect(getTargetLabel("unknown_type", "42")).toBe("unknown_type: 42");
  });
});

describe("getDetailsSummary", () => {
  it("details 없으면 '-'", () => {
    expect(getDetailsSummary("admin_recrawl_articles", undefined)).toBe("-");
    expect(getDetailsSummary("admin_recrawl_articles", {})).toBe("-");
  });

  it("admin_recrawl_articles: level + force 한글", () => {
    expect(getDetailsSummary("admin_recrawl_articles", { level: "safe", force: false })).toBe("안전");
    expect(getDetailsSummary("admin_recrawl_articles", { level: "warn", force: true })).toBe("주의 · 강제");
    expect(getDetailsSummary("admin_recrawl_articles", { level: "danger", force: false })).toBe("위험");
  });

  it("admin_recrawl_single: force 만 처리 (level 없음)", () => {
    expect(getDetailsSummary("admin_recrawl_single", { force: true })).toBe("강제");
    expect(getDetailsSummary("admin_recrawl_single", { force: false })).toBe("-");
  });

  it("admin_verify_reject: reason 표시", () => {
    expect(getDetailsSummary("admin_verify_reject", { reason: "자격증 미제출" })).toBe("사유: 자격증 미제출");
  });

  it("admin_user_update: 필드 나열", () => {
    expect(getDetailsSummary("admin_user_update", { role: "admin" })).toBe("role=admin");
    expect(getDetailsSummary("admin_user_update", { role: "user", status: "approved" })).toBe("role=user, status=approved");
  });

  it("verify_submit: business_verified + auto_approved", () => {
    expect(getDetailsSummary("verify_submit", { business_verified: true, auto_approved: false })).toBe("사업자 확인");
    expect(getDetailsSummary("verify_submit", { business_verified: true, auto_approved: true })).toBe("사업자 확인 · 자동 승인");
    expect(getDetailsSummary("verify_submit", { business_verified: false, auto_approved: false })).toBe("미확인");
  });

  it("admin_data_cleanup: days + deleted", () => {
    expect(getDetailsSummary("admin_data_cleanup", { days: 90, deleted: 1234 })).toBe("90일 이전 · 1234건 삭제");
  });

  it("미정의 액션은 JSON.stringify fallback", () => {
    expect(getDetailsSummary("unknown_action", { foo: "bar", num: 42 })).toBe('{"foo":"bar","num":42}');
  });
});
