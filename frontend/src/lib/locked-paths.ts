/**
 * 잠긴(진입 차단) 페이지 경로 목록 — 세션 400 무료 전환.
 *
 * 배경: 유료 구독을 잠시 닫고 무료로 전환하기로 했다(유료 고객 0명 실측).
 * 결제 관련 화면·코드는 나중에 매출을 시작할 때 그대로 쓰려고 **지우지 않고 보존**하고,
 * 사용자가 그 화면으로 "들어가는 길"만 막는다(헤더 메뉴 제거 + proxy 리다이렉트 +
 * sitemap 제외 + robots 차단).
 *
 * 뒷문(백엔드 결제 API·자동결제 스케줄러)은 여기가 아니라 BE 의 `PAYMENT_ENABLED`
 * 환경변수가 막는다 — 화면만 막으면 API 를 직접 부르는 길이 열려 있기 때문.
 *
 * 다시 열 때: 이 배열에서 해당 경로를 빼고, 헤더 메뉴·sitemap·robots 를 되돌린다.
 */
export const LOCKED_PATHS = ["/pricing"] as const;

/**
 * 주어진 경로가 잠긴 페이지인지 판정한다.
 *
 * 정확히 일치하거나(`/pricing`), 그 하위 경로(`/pricing/anything`)면 true.
 * `/pricing-x`·`/pricingfoo` 처럼 **이름이 우연히 겹치는 다른 경로**는 false —
 * 단순 `startsWith("/pricing")` 로 판정하면 이런 무관한 경로까지 막는 오탐이 난다.
 *
 * 대소문자는 그대로 비교한다(Next.js 라우팅 자체가 대소문자를 구분하므로
 * `/Pricing` 은 애초에 존재하지 않는 경로다).
 */
export function isLockedPath(pathname: string): boolean {
  return LOCKED_PATHS.some(
    (locked) => pathname === locked || pathname.startsWith(`${locked}/`),
  );
}
