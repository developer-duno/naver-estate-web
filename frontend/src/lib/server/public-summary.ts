import "server-only";

/**
 * 단지 공개 요약 받기 — 서버 렌더(ISR) 전용(세션 483 PR 3b, 설계 v2 O7 · 결정 21).
 *
 * 서버 렌더 열쇠(env SSR_SHARED_KEY)를 머리 X-SSR-Key 로 붙인다 — 백엔드가 맞으면 서버 렌더 전용 통(분당 300)으로 받는다.
 * 열쇠 값은 어디에도 찍지 않는다(로그·오류 글자 0). NEXT_PUBLIC_ 이 아니라 브라우저 번들에 들어가지 않고,
 * 위 "server-only" 가 클라이언트 컴포넌트에서 이 파일을 부르면 빌드를 멈춘다.
 *
 * 답: 404 → null(없는 단지 — 페이지가 notFound) · 그 밖 실패(429·5xx·네트워크) → throw(진짜 단지가 404 로 하루 굳지 않게).
 */
import { notFound } from "next/navigation";
import type { ClientSeed, PublicSummary } from "@/types/public-summary";

/** 단지 번호 모양 — 숫자 1~8자리. 아니면 백엔드를 부르지 않고 notFound */
export const COMPLEX_NO_RE = /^\d{1,8}$/;

/** ISR·데이터 캐시 수명(초) — 페이지 revalidate 와 같은 값 */
export const SUMMARY_REVALIDATE_SEC = 86400;

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}

/** 열쇠 머리 — 값이 비면 머리를 붙이지 않는다 */
export function ssrKeyHeaders(): Record<string, string> {
  const key = (process.env.SSR_SHARED_KEY ?? "").trim();
  return key ? { "X-SSR-Key": key } : {};
}

export async function fetchPublicSummary(complexNo: string): Promise<PublicSummary | null> {
  const base = apiBase();
  if (!base) throw new Error("백엔드 주소가 없어 단지 요약을 받지 못했어요");
  const res = await fetch(`${base}/api/complexes/${encodeURIComponent(complexNo)}/public-summary`, {
    headers: ssrKeyHeaders(),
    next: { revalidate: SUMMARY_REVALIDATE_SEC },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`단지 요약을 받지 못했어요 (HTTP ${res.status})`);
  return (await res.json()) as PublicSummary;
}

/** 번호 확인 → 요약 받기 — 숫자 1~8자리가 아니면 백엔드를 부르지 않고 notFound(), 없는 단지도 notFound(). 그 밖 실패는 throw 그대로 */
export async function loadSummary(no: string): Promise<PublicSummary> {
  if (!COMPLEX_NO_RE.test(no)) notFound();
  const summary = await fetchPublicSummary(no);
  if (!summary) notFound();
  return summary;
}

/** 클라이언트에 넘기는 재료 — 화면에 쓰는 칸만(주차·등급 등 안 보이는 칸은 RSC payload 에 싣지 않는다) */
export function clientSeedOf(s: PublicSummary): ClientSeed {
  return {
    complex_no: s.complex_no,
    basis_ym: s.basis_ym,
    breadcrumb: s.breadcrumb,
    official_price: s.official_price,
    subway: s.subway,
    // 서버가 그린 시각 — 화면 쿼리의 initialDataUpdatedAt(ISR 이면 그 장을 그린 시각)
    at: Date.now(),
  };
}
