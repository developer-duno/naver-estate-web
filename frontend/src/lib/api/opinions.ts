/**
 * 의견함 API — 손님이 보내는 의견 (세션 433, 서버 짝꿍 = backend/routers/opinions.py)
 *
 * submitOpinion 은 fetchApi 를 쓰지 않고 fetch 를 직접 쓴다. fetchApi(core.ts) 는 429 를 받으면
 * 서버 문구를 버리고 "요청 한도… N초 후" 로 바꾸는데, 의견함의 429 는 하루 한도라
 * 서버 문구("오늘은 더 보낼 수 없어요…")를 그대로 보여 줘야 하기 때문이다.
 * 실패는 전부 throw 한다(.claude/rules/error-propagation.md — 빈 결과로 바꿔치기 금지).
 */
import { ApiError, DEFAULT_TIMEOUT_MS, getApiBase, normalizeDetail } from "./core";

export type OpinionKind = "bug" | "data" | "suggest" | "other";
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
