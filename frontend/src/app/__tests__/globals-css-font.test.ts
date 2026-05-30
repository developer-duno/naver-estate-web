/**
 * globals.css 폰트 변수 회귀 가드 (PR 7-bugs)
 *
 * jsdom 은 CSS 를 평가하지 않으므로 폰트 *렌더* 는 검증 불가 (선례: compare.test.tsx:168).
 * 대신 globals.css 텍스트를 파싱해 다음 회귀를 차단한다:
 *  - --font-sans 가 다시 자기참조(var(--font-sans))로 되돌아가는 것
 *  - --font-pretendard 연결이 끊기는 것
 *  - @theme inline 의 inline 키워드 제거 (제거 시 유틸이 Pretendard 를 직접 박지 못해 조용히 UA 기본으로 회귀)
 *
 * 근거: globals.css:10 자기참조 dead variable 로 전 사이트가 OS 기본 sans 로
 * 렌더되던 버그(spec §폰트 "Pretendard 단일" 미달) 수정 후 재발 방지.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(resolve(__dirname, "../globals.css"), "utf-8");

/** --font-sans: ... ; 선언의 값 부분만 추출 */
function fontSansDeclaration(): string {
  const match = globalsCss.match(/--font-sans:\s*([^;]+);/);
  if (!match) throw new Error("globals.css 에서 --font-sans 선언을 찾지 못함");
  return match[1].trim();
}

describe("globals.css 폰트 변수", () => {
  it("--font-sans 가 자기 자신(var(--font-sans))을 참조하지 않는다 (dead variable 회귀 차단)", () => {
    const value = fontSansDeclaration();
    expect(value).not.toMatch(/var\(\s*--font-sans\s*\)/);
  });

  it("--font-sans 가 Pretendard(var(--font-pretendard))로 연결돼 있다", () => {
    const value = fontSansDeclaration();
    expect(value).toContain("var(--font-pretendard)");
  });

  it("--font-mono 가 Geist Mono(var(--font-geist-mono))를 가리킨다", () => {
    expect(globalsCss).toMatch(/--font-mono:\s*var\(--font-geist-mono\)\s*;/);
  });

  it("@theme inline 블록이 유지된다 (inline 키워드 제거 시 폰트가 UA 기본으로 회귀)", () => {
    expect(globalsCss).toMatch(/@theme\s+inline\s*\{/);
  });
});
