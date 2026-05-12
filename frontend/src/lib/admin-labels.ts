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

/** details JSON 을 액션별 사람이 읽을 요약으로. 미정의 시 JSON.stringify. */
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
    const fields = Object.entries(details).map(([k, v]) => `${k}=${v}`).join(", ");
    return fields || "-";
  }

  if (action === "verify_submit") {
    const verified = details.business_verified === true ? "사업자 확인" : "미확인";
    const auto = details.auto_approved === true ? " · 자동 승인" : "";
    return `${verified}${auto}`;
  }

  if (action === "admin_data_cleanup") {
    return `${details.days}일 이전 · ${details.deleted}건 삭제`;
  }

  return JSON.stringify(details);
}
