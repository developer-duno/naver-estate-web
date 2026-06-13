/** 사용자 프로필 */
export interface UserProfile {
  user_id: string;
  email: string;
  display_name?: string;
  role: 'user' | 'admin' | 'expert';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  daily_crawl_quota: number;
  daily_export_quota: number;
  approved_until?: string | null;
  last_login_at?: string;
  login_count: number;
  /** 회원가입 마케팅 수신 동의 (V028, BE deps.py 자동 저장) */
  agree_marketing?: boolean;
  created_at: string;
  updated_at?: string;
}

/** 감사 로그 */
export interface AuditLog {
  id: number;
  user_id?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

/** 관리자 설정 */
export interface AdminSetting {
  key: string;
  value: unknown;
  updated_by?: string;
  updated_at?: string;
}

/** 크롤 작업 상세 (관리자용) */
export interface CrawlJobDetail {
  id: number;
  job_type: string;
  target_id?: string;
  status: string;
  total_items: number;
  processed_items: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

/** 상세 DB 통계 (관리자용) */
export interface DetailedStats {
  complex_count: number;
  article_count: number;
  active_article_count: number;
  user_count: number;
  today_crawl_count: number;
  recent_crawl_jobs: CrawlJobDetail[];
  last_crawl_at?: string;
  error_count_24h: number;
  total_article_count?: number;
  /** 채움률 3건 (PR 6a). 0건 모집단 = null (FE "—" 표시), 0% 채움률 = 0 (FE "0.00%" 표시) */
  complex_detail_fill_rate?: number | null;
  article_detail_fill_rate?: number | null;
  complex_metric_fill_rate?: number | null;
}

/** 사용자 역할/상태 업데이트 */
export interface UserUpdatePayload {
  role?: 'user' | 'admin' | 'expert';
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  approved_until?: string | null;
  daily_crawl_quota?: number;
  daily_export_quota?: number;
}

/** 페이지네이션 응답 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** 스케줄러 작업 마지막 실행 정보 */
export interface SchedulerLastRun {
  status: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  total_items: number;
  processed_items: number;
  error_message?: string;
}

/** 스케줄러 작업별 상태 */
export interface SchedulerJobStatus {
  scheduler_job_id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  last_run: SchedulerLastRun | null;
  next_run_at?: string;
  stats_24h: { runs: number; failures: number };
}

/** 스케줄러 모니터링 응답 */
export interface SchedulerStatusResponse {
  jobs: SchedulerJobStatus[];
  summary: {
    total_runs_today: number;
    failures_today: number;
  };
}

/** 스케줄러 캘린더 단일 이벤트 (FullCalendar 가 그대로 파싱 가능한 형태) */
export interface SchedulerCalendarEvent {
  scheduler_job_id: string;
  name: string;
  /** KST iso 문자열 (예: "2026-05-15T12:00:00+09:00") */
  start: string;
  /** past 이면 CrawlJob.status, upcoming 이면 "upcoming" */
  status: "completed" | "failed" | "running" | "paused" | "pending" | "cancelled" | "upcoming";
  kind: "past" | "upcoming";
}

/** 스케줄러 캘린더 응답 */
export interface SchedulerCalendarResponse {
  year: number;
  month: number;
  mode: "past" | "upcoming" | "both";
  events: SchedulerCalendarEvent[];
  /** 안전 상한 (5만 이벤트) 도달로 잘려 반환됐는지 */
  truncated: boolean;
}

/** 공인중개사 검증 신청 */
export interface AgentVerification {
  id: number;
  user_id: string;
  email?: string;
  license_number?: string;
  business_number?: string;
  office_name?: string;
  representative_name: string;
  business_verified: boolean;
  license_verified: boolean;
  license_doc_url?: string;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  reviewed_by?: string;
  submitted_at: string;
  reviewed_at?: string;
}

/** 검증 상태 조회 응답 */
export interface VerificationStatusResponse {
  submitted: boolean;
  verification_status?: "pending" | "approved" | "rejected";
  business_verified?: boolean;
  license_doc_uploaded?: boolean;
  rejection_reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
}

/** 검증 신청 응답 */
export interface VerifySubmitResponse {
  status: "approved" | "pending" | "rejected";
  business_verified: boolean;
  business_message: string;
  business_status_code?: string | null; // 국세청 영업상태 "01"/"02"/"03"/"" 또는 null(조회실패)
  auto_approved: boolean;
}

/** 자격증 서류 업로드 응답 */
export interface LicenseUploadResponse {
  uploaded: boolean;
  path: string;
}

/** 데이터 신선도 — 마지막 수집 작업 메타 */
export interface DataFreshnessJob {
  started_at: string | null;
  completed_at: string | null;
  processed_items: number;
  total_items: number;
}

/** 데이터 신선도 — 종목 1건 */
export interface DataFreshnessItem {
  key: string;
  label: string;
  count: number;
  last_updated: string | null;
  expected_interval_seconds: number;
  status: "green" | "yellow" | "red" | "unknown";
  /** 헛바퀴 의심 여부 (작업 돌았는데 신규 행 0 또는 processed 0) */
  spinning: boolean;
  /** 마지막 수집 작업 — 정기 job 없는 종목은 null */
  last_job: DataFreshnessJob | null;
  /** 작업 시작 후 신규 행 수 — 측정 불가 종목은 null */
  new_rows: number | null;
}

/** 데이터 신선도 응답 */
export interface DataFreshnessResponse {
  items: DataFreshnessItem[];
  generated_at: string;
}

/** 공공데이터 API 쿼터 현황 (오늘) — BE `crawler/quota_db.py:62~89` 답습 */
export interface QuotaStatus {
  api_name: string;
  date: string;
  count: number;
  limit: number;
  remaining: number;
  utilization_pct: number;
}
