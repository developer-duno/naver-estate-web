/**
 * CSP 회귀 가드 — PortOne 결제 도메인이 next.config.ts CSP 에서 빠지지 않게 한다.
 *
 * 세션 326 사고: PortOne 가입·키·prepare 200 전부 성공했으나, 운영 결제창이 안 떴다.
 * 원인 = next.config.ts script-src 에 cdn.portone.io 누락 → npm SDK 가 런타임에 로드하는
 * https://cdn.portone.io/v2/browser-sdk.js 가 CSP 차단 → window.PortOne 생성 실패.
 * 누가 CSP 를 손대다 PortOne 도메인을 다시 빠뜨리면 결제창이 조용히 죽으므로 텍스트 가드로 박제.
 *
 * next.config.ts 는 MDX 플러그인 래핑 탓에 직접 import 가 까다로워, 소스 텍스트를 직접 검사한다
 * (scripts/check-mdx-jsx 류 정적 텍스트 가드 패턴 답습).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const configSrc = readFileSync(
  resolve(__dirname, "../../next.config.ts"),
  "utf-8",
);

/** CSP 문자열에서 특정 directive 줄만 뽑는다 (예: "script-src '...'"). */
function directiveLine(name: string): string {
  const line = configSrc
    .split("\n")
    .find((l) => l.includes(`${name} 'self'`) || l.includes(`${name}-src 'self'`) || l.includes(`${name} `));
  return line ?? "";
}

describe("next.config.ts CSP — PortOne 결제 도메인", () => {
  it("script-src 에 cdn.portone.io 가 있어야 SDK 가 로드된다 (결제창 표시 필수)", () => {
    const scriptSrc = configSrc
      .split("\n")
      .find((l) => l.includes("script-src 'self'"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("https://cdn.portone.io");
  });

  it("script-src 에 *.portone.io 가 있어야 결제 SDK 하위 리소스가 로드된다", () => {
    const scriptSrc = configSrc
      .split("\n")
      .find((l) => l.includes("script-src 'self'"));
    expect(scriptSrc).toContain("https://*.portone.io");
  });

  it("connect-src 에 *.portone.io 가 있어야 결제 준비·상태조회 API 호출이 통과한다", () => {
    const connectSrc = configSrc
      .split("\n")
      .find((l) => l.includes("connect-src 'self'"));
    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain("https://*.portone.io");
  });

  // SDK 가 결제 준비를 checkout-service.prod.iamport.co (PortOne 옛 도메인) 로 호출 (세션 326 콘솔 확정)
  it("connect-src 에 *.iamport.co 가 있어야 결제 준비 API(checkout-service)가 통과한다", () => {
    const connectSrc = configSrc
      .split("\n")
      .find((l) => l.includes("connect-src 'self'"));
    expect(connectSrc).toContain("https://*.iamport.co");
  });

  it("script-src 에 *.iamport.co 가 있어야 결제창 스크립트가 로드된다", () => {
    const scriptSrc = configSrc
      .split("\n")
      .find((l) => l.includes("script-src 'self'"));
    expect(scriptSrc).toContain("https://*.iamport.co");
  });

  it("frame-src 에 *.portone.io 가 있어야 결제창 iframe·PG 리다이렉트가 뜬다", () => {
    const frameSrc = configSrc
      .split("\n")
      .find((l) => l.includes("frame-src 'self'"));
    expect(frameSrc).toBeDefined();
    expect(frameSrc).toContain("https://*.portone.io");
  });

  // KPN(한국결제네트웍스) PG 결제창이 *.firstpay.co.kr iframe 으로 뜸 (세션 326 라이브 확정)
  it("frame-src 에 *.firstpay.co.kr 가 있어야 KPN PG 결제창 iframe 이 뜬다", () => {
    const frameSrc = configSrc
      .split("\n")
      .find((l) => l.includes("frame-src 'self'"));
    expect(frameSrc).toContain("https://*.firstpay.co.kr");
  });

  it("directiveLine 헬퍼가 빈 줄을 반환하지 않는지 (가드 자체 sanity)", () => {
    expect(directiveLine("script")).not.toBe("");
  });
});
