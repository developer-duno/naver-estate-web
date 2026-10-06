/**
 * 화면 오류 자동 보고 (세션 439) — 손님 화면에서 오류가 나면 서버 의견함에 '자동 오류'로 한 줄 남긴다.
 * 서버 짝꿍 = backend/routers/opinions.py `POST /api/opinions/error`(같은 오류는 횟수만 센다).
 *
 * - 운영 빌드에서만 보낸다(개발·시험 중 오류가 의견함을 채우지 않게).
 * - 로그인 토큰은 붙이지 않는다 — 누가 겪었는지는 모으지 않는다(처리방침 1절).
 * - 한 방문(탭)에 총 5통, 같은 오류(이름+문구)는 1통만. 기록은 sessionStorage, 막혀 있으면 메모리.
 *
 * ⚠ error-propagation.md 예외: 이 함수만은 실패를 삼킨다 — 보고 함수가 오류를 던지면
 *   그 오류가 다시 오류 화면·보고로 이어져 끝없이 반복되기 때문이다.
 */
import { getApiBase } from "./api/core";

const SENT_KEY = "2u.error.sent";
const MAX_PER_VISIT = 5;
const MAX_NAME = 100;
const MAX_MESSAGE = 300;
const MAX_AREA = 300;

interface SentState {
  count: number;
  keys: string[];
}

/** sessionStorage 를 못 쓸 때(사생활 모드 등) 쓰는 이 탭 메모리 기록 */
let memoryState: SentState = { count: 0, keys: [] };

function readState(): SentState {
  try {
    const raw = window.sessionStorage.getItem(SENT_KEY);
    if (!raw) return memoryState;
    const parsed = JSON.parse(raw) as Partial<SentState>;
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      keys: Array.isArray(parsed.keys) ? parsed.keys.filter((k): k is string => typeof k === "string") : [],
    };
  } catch {
    return memoryState;
  }
}

function writeState(state: SentState) {
  memoryState = state;
  try {
    window.sessionStorage.setItem(SENT_KEY, JSON.stringify(state));
  } catch {
    // 저장소가 막혀도 메모리 기록으로 이 탭 안에서는 같은 상한이 지켜진다
  }
}

function firstLine(text: unknown): string {
  if (typeof text !== "string") return "";
  return (text.split(/\r?\n/, 1)[0] ?? "").trim().slice(0, MAX_MESSAGE);
}

/** 화면 오류를 서버에 알린다 — 실패해도 아무 일도 일어나지 않는다 */
export function reportClientError(error: unknown, area?: string): void {
  try {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    const base = getApiBase();
    if (!base) return;

    const err = (error ?? {}) as { name?: unknown; message?: unknown; digest?: unknown };
    const name = (typeof err.name === "string" && err.name ? err.name : "Error").slice(0, MAX_NAME);
    const message = firstLine(err.message);
    const key = `${name}|${message}`;

    const state = readState();
    if (state.count >= MAX_PER_VISIT || state.keys.includes(key)) return;
    writeState({ count: state.count + 1, keys: [...state.keys, key] });

    const body: Record<string, string> = {
      area: (area ?? window.location.pathname ?? "/").slice(0, MAX_AREA),
      name,
      message,
    };
    if (typeof err.digest === "string" && err.digest) body.digest = err.digest.slice(0, MAX_NAME);

    void fetch(`${base}/api/opinions/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // 보내기 실패는 조용히 넘긴다(위 머리 주석의 예외 이유)
    });
  } catch {
    // fetch 가 없거나 동기 오류 — 역시 조용히 넘긴다
  }
}
