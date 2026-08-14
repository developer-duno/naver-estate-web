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

describe("formatIsoDate 롤오버 방어 (적대리뷰 High①)", () => {
  it("존재하지 않는 날짜는 원문 유지 — JS Date 롤오버로 값이 둔갑하면 안 된다", () => {
    // new Date("2026-02-30") 은 3월 2일로 조용히 넘어간다. 감사 로그 값이 바뀌면
    // "언제까지 승인됐나"를 잘못 읽게 되므로 원문을 그대로 남긴다.
    expect(getDetailsSummary("admin_user_update", { approved_until: "2026-02-30" })).toBe(
      "승인 만료일: 2026-02-30",
    );
    expect(getDetailsSummary("admin_user_update", { approved_until: "2026-11-31" })).toBe(
      "승인 만료일: 2026-11-31",
    );
  });

  it("윤년 아닌 해의 2월 29일도 원문 유지", () => {
    // 2026 은 평년 — 2/29 는 3/1 로 롤오버된다
    expect(getDetailsSummary("admin_user_update", { approved_until: "2026-02-29" })).toBe(
      "승인 만료일: 2026-02-29",
    );
  });

  it("실제 존재하는 날짜는 정상 포맷 (윤년 2/29 포함)", () => {
    // 2028 은 윤년이라 2/29 가 실재 — 롤오버 가드가 정상 날짜를 막으면 안 된다
    const out = getDetailsSummary("admin_user_update", { approved_until: "2028-02-29" });
    expect(out.startsWith("승인 만료일: ")).toBe(true);
    expect(out).not.toContain("2028-02-29"); // 원문 그대로가 아니라 포맷된 형태
    expect(out).toContain("2028");
  });

  it("오프셋이 붙은 값은 대조를 걸지 않아 오탐하지 않는다", () => {
    // "+09:00" 값은 보는 시간대에 따라 UTC 로는 하루 전으로 보인다 — 여기에 대조를
    // 걸면 멀쩡한 값이 원문으로 떨어진다. 포맷된 결과가 나와야 정상.
    const out = getDetailsSummary("admin_user_update", {
      approved_until: "2026-08-14T00:00:00+09:00",
    });
    expect(out.startsWith("승인 만료일: ")).toBe(true);
    expect(out).toContain("2026");
    expect(out).not.toContain("T00:00:00"); // 원문 폴백이 아님
  });
});

describe("결제 details 키 매핑 (적대리뷰 Med③)", () => {
  it("위조 감지 details(expected·detail) 가 한글 + 원화로", () => {
    expect(
      getDetailsSummary("payment_forgery_rejected", { expected: 12000, detail: "금액 불일치" }),
    ).toBe("기대 금액: 12,000원, 오류 내용: 금액 불일치");
  });

  it("정기결제 위조 감지(expected·actual) 가 한글 + 원화로", () => {
    expect(
      getDetailsSummary("billing_forgery_rejected", { expected: 12000, actual: 10 }),
    ).toBe("기대 금액: 12,000원, 실제 결제액: 10원");
  });

  it("환불 details(cancelled_amount·rolled_back_days) 가 한글 + 단위로", () => {
    expect(
      getDetailsSummary("payment_refunded", {
        plan: "pro",
        amount: 12000,
        cancelled_amount: 12000,
        rolled_back_days: 30,
      }),
    ).toBe("요금제: pro, 금액: 12,000원, 취소 금액: 12,000원, 회수 일수: 30일");
  });

  it("금액 키가 숫자가 아니면 원문 유지 (정보 손실 방지)", () => {
    expect(getDetailsSummary("payment_refunded", { cancelled_amount: null })).toBe(
      "취소 금액: 없음",
    );
    expect(getDetailsSummary("payment_refunded", { actual: "미확인" })).toBe(
      "실제 결제액: 미확인",
    );
  });
});

describe("프로토타입 키 방어 (적대리뷰 Med④)", () => {
  it("toString 키가 native code 문자열로 새지 않는다", () => {
    expect(getDetailsSummary("unknown_action", { toString: "hack" })).toBe("toString: hack");
  });

  it("constructor·hasOwnProperty 등 상속 키도 안전", () => {
    expect(getDetailsSummary("unknown_action", { constructor: "x" })).toBe("constructor: x");
    expect(getDetailsSummary("unknown_action", { hasOwnProperty: "y" })).toBe(
      "hasOwnProperty: y",
    );
  });

  it("액션·타깃 사전도 상속 키에 오염되지 않는다", () => {
    expect(getActionLabel("toString")).toBe("toString");
    expect(getTargetLabel("toString", "1")).toBe("toString: 1");
    expect(getTargetLabel("collector", "toString")).toBe("수집기: toString");
  });
});

describe("배열 값 표시 (적대리뷰 Low②)", () => {
  it("배열은 JSON 덤프 대신 쉼표로 이어 붙인다", () => {
    expect(getDetailsSummary("unknown_action", { targets: ["a", "b", "c"] })).toBe(
      "targets: a, b, c",
    );
  });

  it("빈 배열은 빈 문자열", () => {
    expect(getDetailsSummary("unknown_action", { targets: [] })).toBe("targets: ");
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
