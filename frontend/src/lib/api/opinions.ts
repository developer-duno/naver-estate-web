/**
 * 의견함 API — 손님이 보내는 의견 (세션 433, 서버 짝꿍 = backend/routers/opinions.py)
 *
 * submitOpinion 은 fetchApi 를 쓰지 않고 fetch 를 직접 쓴다. fetchApi(core.ts) 는 429 를 받으면
 * 서버 문구를 버리고 "요청 한도… N초 후" 로 바꾸는데, 의견함의 429 는 하루 한도라
 * 서버 문구("오늘은 더 보낼 수 없어요…")를 그대로 보여 줘야 하기 때문이다.
 * 실패는 전부 throw 한다(.claude/rules/error-propagation.md — 빈 결과로 바꿔치기 금지).
 */
import { ApiError, DEFAULT_TIMEOUT_MS, adminHeaders, fetchApi, getApiBase, normalizeDetail } from "./core";

export type OpinionKind = "bug" | "data" | "suggest" | "other";
/** 관리자 화면에서만 보이는 종류 — 'error' 는 화면 오류 자동 보고(세션 439)라 손님 보내기 창에는 없다 */
export type AdminOpinionKind = OpinionKind | "error";
export type OpinionInterest = "market" | "presale" | "tax" | "other";

export interface OpinionSubmitBody {
  kind: OpinionKind;
  message: string;
  /** 보던 화면 주소 — usePathname() 값(쿼리 없음) */
  page_path?: string;
  /** "어떤 소식이 궁금하세요?" 설문(선택) */
  interests?: OpinionInterest[];
  /** 숨김 칸 — 사람은 비워 둔다(값이 있으면 서버가 저장하지 않음) */
  website?: string;
}

export interface OpinionSubmitResponse {
  id: number;
  received: true;
  /** 로그인 상태로 받아 답장 메일을 보낼 수 있는지 */
  can_reply: boolean;
}

/** 하루 한도 429 에 서버 문구가 없을 때 쓰는 문구(서버 문구와 같은 뜻) */
const DAILY_LIMIT_FALLBACK = "오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요";

/** 의견 보내기 — 토큰은 로그인한 경우에만 넣는다 */
export async function submitOpinion(
  body: OpinionSubmitBody,
  token?: string,
): Promise<OpinionSubmitResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${getApiBase()}/api/opinions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data: { detail?: unknown } = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const detail = typeof data.detail === "string" && data.detail ? data.detail : DAILY_LIMIT_FALLBACK;
        throw new ApiError(detail, 429);
      }
      throw new ApiError(normalizeDetail(data.detail, res.status), res.status);
    }
    return (await res.json()) as OpinionSubmitResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("서버 응답 시간이 초과되었습니다");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── "고쳤습니다" 공개 목록 + 관리자 의견함 (세션 437 PR C, 서버 짝꿍 = backend/routers/opinions.py ·
//    backend/routers/admin/opinions.py). 실패는 fetchApi 가 throw 하는 그대로 둔다(빈 목록으로 바꾸지 않음).

/** 의견 상태 — 공개 목록에도 4가지가 다 올 수 있다 */
export type OpinionStatus = "new" | "replied" | "fixed" | "closed";

/** 공개 목록 한 줄 — 원문·이메일·화면 주소는 서버가 아예 싣지 않는다 */
export interface PublicUpdateItem {
  id: number;
  public_title: string;
  public_answer: string;
  status: OpinionStatus;
  published_at: string | null;
}

export interface PublicUpdatesResponse {
  items: PublicUpdateItem[];
  total: number;
  page: number;
}

/** 관리자 화면의 의견 한 줄 */
export interface AdminOpinion {
  id: number;
  kind: AdminOpinionKind;
  /** 1년 정리 뒤에는 NULL */
  message: string | null;
  page_path: string | null;
  interests: OpinionInterest[] | null;
  user_id: string | null;
  user_email: string | null;
  user_agent: string | null;
  status: OpinionStatus;
  reply: string | null;
  replied_at: string | null;
  reply_mail_sent: boolean;
  is_public: boolean;
  public_title: string | null;
  public_answer: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // ↓ 자동 오류 행 전용(세션 439). 화면이 서버 재시작보다 먼저 배포될 수 있어 선택 칸으로 둔다
  /** 같은 오류가 몇 번 났는지(손님 의견은 1) */
  repeat_count?: number;
  /** 같은 오류가 마지막으로 난 시각 */
  last_seen_at?: string | null;
  fingerprint?: string | null;
}

export interface AdminOpinionsResponse {
  items: AdminOpinion[];
  total: number;
  page: number;
  /** 필터와 무관한 전체 '새 의견' 수 — 메뉴 배지에 쓴다(자동 오류는 빼고 센다) */
  new_count: number;
  /** 개인정보가 아직 남은 의견 중 가장 오래된 것이 며칠째인지 — 없으면 null. 366 을 넘으면 1년 정리가 멈춘 것 */
  oldest_days?: number | null;
}

export interface AdminOpinionUpdatePayload {
  status?: OpinionStatus;
  reply?: string;
  is_public?: boolean;
  public_title?: string;
  public_answer?: string;
}

/** PATCH 응답 = 바뀐 행 + 이번 저장에서 메일을 보냈는지 */
export type AdminOpinionUpdateResult = AdminOpinion & { mail_sent: boolean };

/** 한 쪽에 담기는 줄 수(서버 PUBLIC_PAGE_SIZE·ADMIN_PAGE_SIZE 와 같다) */
export const OPINION_PAGE_SIZE = 20;

/** 공개 목록 — 서버 컴포넌트에서 부르므로 Next 캐시 5분(revalidate 300)을 건다 */
export async function getPublicUpdates(page: number = 1) {
  const qs = new URLSearchParams({ page: String(page) });
  return fetchApi<PublicUpdatesResponse>(`/api/opinions/public?${qs}`, {
    next: { revalidate: 300 },
  });
}

/** 관리자: 의견 목록(상태·종류 필터·쪽) */
export async function getAdminOpinions(
  token: string,
  params?: { status?: OpinionStatus; kind?: AdminOpinionKind; page?: number },
) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.kind) qs.set("kind", params.kind);
  if (params?.page) qs.set("page", String(params.page));
  return fetchApi<AdminOpinionsResponse>(`/api/admin/opinions?${qs}`, { headers: adminHeaders(token) });
}

/** 관리자: 답장·공개·상태 저장 */
export async function updateAdminOpinion(token: string, id: number, payload: AdminOpinionUpdatePayload) {
  return fetchApi<AdminOpinionUpdateResult>(`/api/admin/opinions/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

/** 관리자: 답장 메일 다시 보내기 */
export async function resendOpinionMail(token: string, id: number) {
  return fetchApi<{ sent: boolean }>(`/api/admin/opinions/${encodeURIComponent(String(id))}/resend-mail`, {
    method: "POST",
    headers: adminHeaders(token),
  });
}

/** 관리자: 의견 지우기(되돌릴 수 없음) */
export async function deleteAdminOpinion(token: string, id: number) {
  return fetchApi<{ deleted: true }>(`/api/admin/opinions/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
}
