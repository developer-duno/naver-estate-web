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
  summarizeDetails,
} from "../admin-labels";

describe("admin-labels 매핑 카운트", () => {
  it("ACTION_LABELS = 23개 (BE log_action 호출 답습 — R3 결제·정기결제 8종 추가)", () => {
    expect(Object.keys(ACTION_LABELS)).toHaveLength(23);
  });

  it("TARGET_TYPE_LABELS = 10개 (BE target_type 답습 — R3 매물·결제·정기결제 추가)", () => {
    expect(Object.keys(TARGET_TYPE_LABELS)).toHaveLength(10);
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

  it("admin_user_update: 키·값 모두 한글로 (R3 — key=value 덤프 폐기)", () => {
    expect(getDetailsSummary("admin_user_update", { role: "admin" })).toBe("역할: 관리자");
    expect(getDetailsSummary("admin_user_update", { role: "user", status: "approved" })).toBe(
      "역할: 일반, 상태: 승인",
    );
    expect(getDetailsSummary("admin_user_update", { daily_crawl_quota: 100 })).toBe(
      "하루 크롤 한도: 100",
    );
  });

  it("admin_user_update: approved_until 은 한국식 날짜로 (R3)", () => {
    // toLocaleDateString("ko") 는 런타임 로캘 표기에 의존 — 날짜 3요소만 확인
    const out = getDetailsSummary("admin_user_update", { approved_until: "2026-12-31" });
    expect(out.startsWith("승인 만료일: ")).toBe(true);
    expect(out).toContain("2026");
    expect(out).toContain("12");
    expect(out).toContain("31");
  });

  it("admin_user_update: 미등록 키는 영문 원문 유지 (정보 손실 방지, R3)", () => {
    expect(getDetailsSummary("admin_user_update", { brand_new_field: "x" })).toBe(
      "brand_new_field: x",
    );
  });

  it("verify_submit: business_verified + auto_approved", () => {
    expect(getDetailsSummary("verify_submit", { business_verified: true, auto_approved: false })).toBe("사업자 확인");
    expect(getDetailsSummary("verify_submit", { business_verified: true, auto_approved: true })).toBe("사업자 확인 · 자동 승인");
    expect(getDetailsSummary("verify_submit", { business_verified: false, auto_approved: false })).toBe("미확인");
  });

  it("admin_data_cleanup: days + deleted", () => {
    expect(getDetailsSummary("admin_data_cleanup", { days: 90, deleted: 1234 })).toBe("90일 이전 · 1234건 삭제");
  });

  it("미정의 액션도 '이름: 값' 자연문 요약 (R3 — JSON 덤프 폐기)", () => {
    // 미등록 키는 영문 원문 유지 → 개발자가 툴팁 JSON 과 대조 가능
    expect(getDetailsSummary("unknown_action", { foo: "bar", num: 42 })).toBe("foo: bar, num: 42");
  });

  it("미정의 액션 + 등록 키는 한글 요약 (R3)", () => {
    expect(getDetailsSummary("admin_setting_update", { batch_size: 500, level: "safe" })).toBe(
      "한 번에: 500건, 안전도: 안전",
    );
    expect(getDetailsSummary("billing_cancelled", { plan: "pro" })).toBe("요금제: pro");
  });

  it("불리언은 예/아니오, null 은 '없음' (R3)", () => {
    expect(getDetailsSummary("unknown_action", { force: true })).toBe("강제 실행: 예");
    expect(getDetailsSummary("unknown_action", { force: false })).toBe("강제 실행: 아니오");
    expect(getDetailsSummary("unknown_action", { approved_until: null })).toBe("승인 만료일: 없음");
  });

  it("중첩 객체 값은 JSON 원문 유지 (정보 손실 방지, R3)", () => {
    expect(getDetailsSummary("unknown_action", { nested: { a: 1 } })).toBe('nested: {"a":1}');
  });
});

describe("summarizeDetails (R3 공용 키 매핑)", () => {
  it("여러 키를 쉼표로 이어 붙인다", () => {
    expect(summarizeDetails({ role: "expert", status: "pending" })).toBe(
      "역할: 전문가(중개사), 상태: 대기",
    );
  });

  it("빈 객체는 빈 문자열", () => {
    expect(summarizeDetails({})).toBe("");
  });
});

describe("getActionLabel — R3 결제 액션 보강", () => {
  it("결제·정기결제 액션이 한글로 나온다", () => {
    expect(getActionLabel("payment_complete")).toBe("결제 완료");
    expect(getActionLabel("billing_registered")).toBe("정기결제 카드 등록");
    expect(getActionLabel("payment_forgery_rejected")).toBe("결제 위조 감지·거부");
  });

  it("기존 미등록이던 관리자 액션도 한글", () => {
    expect(getActionLabel("admin_crawl_cancel")).toBe("크롤 작업 취소");
    expect(getActionLabel("admin_setting_update")).toBe("설정 변경");
  });
});
