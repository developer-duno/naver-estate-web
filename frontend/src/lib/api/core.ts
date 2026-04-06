/**
 * FastAPI 백엔드 호출 — 핵심 인프라 (에러, fetch 래퍼, 서킷 브레이커)
 */

export class ApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}

/** 빌드 시점에 결정되는 백엔드 존재 여부 (NEXT_PUBLIC_API_URL 설정 유무) */
const HAS_BACKEND = !!process.env.NEXT_PUBLIC_API_URL;

export const DEFAULT_TIMEOUT_MS = 15_000;
export const LIVE_TIMEOUT_MS = 120_000; // live crawling takes longer

/** 중복 로그아웃 방지 mutex — 401 응답이 동시 다발 시 signOut 1회만 실행 */
let _isLoggingOut = false;

// ── 서킷 브레이커: 백엔드 장애 시 Supabase 직접 조회(api-direct.ts)로 자동 폴백 ──
let _backendDown = false;
let _backendDownSince = 0;
const BACKEND_RETRY_MS = 60_000; // 장애 마킹 후 1분 뒤 백엔드 재시도

/** 백엔드 사용 가능 여부 — 장애 후 BACKEND_RETRY_MS 경과 시 자동 복구 시도 */
export function isBackendAvailable(): boolean {
  if (!HAS_BACKEND) return false;
  if (!_backendDown) return true;
  if (Date.now() - _backendDownSince > BACKEND_RETRY_MS) {
    _backendDown = false;
    return true;
  }
  return false;
}

/** fetch TypeError(DNS 실패, 네트워크 에러) 발생 시 백엔드를 장애 상태로 마킹 */
function markBackendDown() {
  _backendDown = true;
  _backendDownSince = Date.now();
}

/** 핵심 fetch 래퍼: 타임아웃, 401 자동 로그아웃, 429 rate limit, 에러 전파 */
async function _fetchApiImpl<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const externalSignal = options?.signal;
  const controller = externalSignal ? null : new AbortController();
  const timeoutMs = (options as RequestInit & { timeoutMs?: number } | undefined)?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: externalSignal ?? controller!.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // P1-1: 인증 실패 시 자동 로그아웃 (토큰 만료만 — 403은 승인/권한 문제이므로 유지)
      if (res.status === 401 && !_isLoggingOut) {
        if (typeof window !== "undefined") {
          _isLoggingOut = true;
          const { createClient } = await import("@/lib/supabase");
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = "/login";
        }
      }
      // Rate limit 사용자 피드백
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
        throw new ApiError(
          `요청 한도를 초과했습니다. ${seconds}초 후 다시 시도해주세요.`,
          429,
        );
      }
      throw new ApiError(body.detail || `API 오류: ${res.status}`, res.status);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("서버 응답 시간이 초과되었습니다");
    }
    // fetch 자체 실패 (DNS 해석 불가, 네트워크 에러 등)
    if (err instanceof TypeError) {
      markBackendDown();
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** fetchApi — React Query가 요청 중복 제거를 담당 */
export function fetchApi<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  return _fetchApiImpl<T>(path, options);
}

/** Authorization 헤더 생성 헬퍼 */
export function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}
