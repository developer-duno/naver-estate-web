/**
 * 감사 로그 영문 → 한글 매핑.
 * BE log_action() 호출 답습 (backend/routers/admin/*.py, verify.py, articles.py).
 */

export const ACTION_LABELS: Record<string, string> = {
  // 관리자 — 크롤
  admin_recrawl_articles: "매물 일괄 재수집 시작",
  admin_recrawl_single: "단일 단지 재수집",
  admin_crawl_cancel: "크롤 작업 취소",
  admin_crawl_pause: "크롤 작업 일시정지",
  admin_crawl_resume: "크롤 작업 재개",

  // 관리자 — 데이터 수집
  admin_collect_trigger: "데이터 수집 시작",
  admin_backfill_price: "실거래가 보강",

  // 관리자 — 사용자
  admin_user_update: "사용자 정보 수정",
  admin_user_suspend: "사용자 비활성화",

  // 결제 (BE routers/payment.py · billing.py log_action 답습)
  payment_complete: "결제 완료",
  payment_webhook: "결제 알림 수신",
  payment_partial_cancelled: "결제 부분 취소",
  payment_refunded: "결제 환불",
  payment_forgery_rejected: "결제 위조 감지·거부",
  billing_registered: "정기결제 카드 등록",
  billing_cancelled: "정기결제 해지",
  billing_forgery_rejected: "정기결제 위조 감지·거부",

  // 관리자 — 공인중개사 검증
  admin_verify_approve: "중개사 인증 승인",
  admin_verify_reject: "중개사 인증 거부",

  // 관리자 — 설정·정리
  admin_data_cleanup: "오래된 데이터 정리",
  admin_setting_update: "설정 변경",

  // 사용자
  verify_submit: "중개사 인증 신청",
  export: "엑셀 내보내기",
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  batch: "배치",
  collector: "수집기",
  complex: "단지",
  user: "사용자",
  verification: "인증 요청",
  crawl_job: "크롤 작업",
  setting: "설정",
  article: "매물",
  payment: "결제",
  billing: "정기결제",
};

export const COLLECTOR_LABELS: Record<string, string> = {
  "crime-stats": "범죄통계",
  "air-quality": "대기질",
  "emergency": "응급의료",
  "childcare": "어린이집",
  "backfill-price": "실거래가",
};

/** 액션 한글 반환. 미매핑 시 영문 원본. */
export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** target_type:target_id 한글. collector 는 한글 라벨로, batch 는 "N건" 으로. */
export function getTargetLabel(targetType?: string, targetId?: string): string {
  if (!targetType) return "-";
  const typeLabel = TARGET_TYPE_LABELS[targetType] ?? targetType;
  if (targetType === "collector" && targetId) {
    return `${typeLabel}: ${COLLECTOR_LABELS[targetId] ?? targetId}`;
  }
  if (targetType === "batch" && targetId) {
    return `${typeLabel} ${targetId}건`;
  }
  return targetId ? `${typeLabel}: ${targetId}` : typeLabel;
}

/**
 * details JSON 의 키 → 한글 이름.
 * BE log_action(details=...) 이 실제로 담는 키만 등록 (routers/admin/*.py·verify.py·
 * payment.py·billing.py 답습). 미등록 키는 원문 그대로 두어 정보 손실을 막는다.
 */
const DETAIL_KEY_LABELS: Record<string, string> = {
  // 사용자 정보 수정 (admin/users.py changes)
  role: "역할",
  status: "상태",
  approved_until: "승인 만료일",
  daily_crawl_quota: "하루 크롤 한도",
  daily_export_quota: "하루 내보내기 한도",
  // 재수집 (admin/recrawl.py)
  level: "안전도",
  force: "강제 실행",
  parent_job_id: "묶음 작업 번호",
  batch_size: "한 번에",
  // 정리·검증·결제
  days: "기간",
  deleted: "삭제 건수",
  reason: "사유",
  plan: "요금제",
  amount: "금액",
  phone: "연락처",
  business_verified: "사업자 확인",
  auto_approved: "자동 승인",
};

/** 값이 열거형인 키의 한글 값 사전 (예: level=safe → 안전). */
const DETAIL_VALUE_LABELS: Record<string, Record<string, string>> = {
  level: { safe: "안전", warn: "주의", danger: "위험" },
  role: { user: "일반", admin: "관리자", expert: "전문가(중개사)" },
  status: {
    pending: "대기",
    approved: "승인",
    rejected: "거부",
    suspended: "정지",
  },
};

/** ISO 날짜 문자열이면 한국식 날짜로. 아니면 null. */
function formatIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // "2026-08-14" 또는 "2026-08-14T00:00:00+09:00" 형태만 날짜로 다룬다
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ko");
}

/** details 의 값 하나를 사람이 읽을 문자열로. */
function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "없음";
  if (typeof value === "boolean") return value ? "예" : "아니오";

  const enumLabel = DETAIL_VALUE_LABELS[key]?.[String(value)];
  if (enumLabel) return enumLabel;

  if (key === "approved_until") return formatIsoDate(value) ?? String(value);
  if (key === "batch_size") return `${value}건`;
  if (key === "days") return `${value}일`;
  if (key === "deleted") return `${value}건`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * details 전체를 "이름: 값" 자연문으로 요약.
 * 미등록 키는 영문 키 그대로 남겨 개발자가 원문을 대조할 수 있게 한다
 * (툴팁의 JSON 원문과 짝을 이루는 설계 — AuditLogTable title 속성).
 */
export function summarizeDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => `${DETAIL_KEY_LABELS[k] ?? k}: ${formatDetailValue(k, v)}`)
    .join(", ");
}

/** details JSON 을 액션별 사람이 읽을 요약으로. 미정의 시 키 한글 매핑으로 자연문 요약. */
export function getDetailsSummary(action: string, details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return "-";

  // recrawl_articles = {level, force, parent_job_id} (BE recrawl.py L200~207)
  if (action === "admin_recrawl_articles") {
    const level = details.level as string | undefined;
    const force = details.force as boolean | undefined;
    const levelLabel = { safe: "안전", warn: "주의", danger: "위험" }[level ?? ""] ?? level;
    return `${levelLabel ?? "-"}${force ? " · 강제" : ""}`;
  }

  // recrawl_single = {force} (BE recrawl.py L336~343, level 없음)
  if (action === "admin_recrawl_single") {
    const force = details.force as boolean | undefined;
    return force ? "강제" : "-";
  }

  if (action === "admin_verify_reject" && details.reason) {
    return `사유: ${details.reason}`;
  }

  if (action === "admin_user_update") {
    return summarizeDetails(details) || "-";
  }

  if (action === "verify_submit") {
    const verified = details.business_verified === true ? "사업자 확인" : "미확인";
    const auto = details.auto_approved === true ? " · 자동 승인" : "";
    return `${verified}${auto}`;
  }

  if (action === "admin_data_cleanup") {
    return `${details.days}일 이전 · ${details.deleted}건 삭제`;
  }

  // 액션별 전용 요약이 없는 경우 — 키 한글 매핑으로 자연문 요약.
  // 요약이 비면(값이 모두 사라지는 이상 상황) 정보 손실을 막기 위해 원문 JSON 유지.
  return summarizeDetails(details) || JSON.stringify(details);
}
