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
  license_verified?: boolean;
  rejection_reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
}

/** 검증 신청 응답 */
export interface VerifySubmitResponse {
  status: "approved" | "pending";
  business_verified: boolean;
  business_message: string;
  auto_approved: boolean;
}
