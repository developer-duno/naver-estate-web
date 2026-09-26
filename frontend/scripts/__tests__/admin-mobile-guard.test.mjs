/**
 * 관리자 화면 휴대폰 대응 가드 (세션 419, 사장님 "폰도 쓴다" 2026-09-26)
 * 실행: npx vitest run scripts/__tests__/admin-mobile-guard.test.mjs
 *
 * 1) 관리자 표는 최소 폭(min-w-[Npx] 또는 같은 값의 Tailwind 표준 이름 min-w-<숫자>)을 둔다 — 없으면 390px 폭에서 칸이 눌려 머리글·숫자가 세로로
 *    꺾인다(세션 417 미분양 분양가 표와 같은 결함). 새 표가 생겨도 자동으로 검사 대상이 되도록
 *    파일 목록을 손으로 적지 않고 `<table` 이 있는 파일을 전부 훑는다.
 *    예외 1곳 = SchedulerMonitor — 좁은 폭에서 열을 숨기는(hidden sm:table-cell) 설계라 최소 폭을
 *    두면 보이는 두 열만으로 가로 스크롤이 생긴다.
 * 2) 관리자 대시보드 휴대폰 사진(admin-mobile project)의 배선 — playwright project 와 CI matrix·
 *    로그인 산출물 내려받기 조건. 하나라도 빠지면 CI 가 그 장을 **조용히 안 돌리거나**(matrix 누락)
 *    로그인 없이 돌아 홈으로 튕긴다(조건 누락).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADMIN_DIR = join(FRONTEND, "src", "components", "admin");
const NO_MIN_WIDTH_OK = new Set(["SchedulerMonitor.tsx"]);

/** 파일 소스에서 `<table className="…">` 의 클래스 문자열들을 뽑는다 */
export function tableClassNames(src) {
  return [...src.matchAll(/<table\b[^>]*className="([^"]*)"/g)].map((m) => m[1]);
}

/** playwright.config.ts 에서 name 이 주어진 project 객체 블록(중괄호 안)을 뽑는다 */
export function projectBlock(configSrc, name) {
  const at = configSrc.indexOf(`name: "${name}"`);
  if (at === -1) return null;
  const start = configSrc.lastIndexOf("{", at);
  let depth = 0;
  for (let i = start; i < configSrc.length; i++) {
    if (configSrc[i] === "{") depth++;
    else if (configSrc[i] === "}" && --depth === 0) return configSrc.slice(start, i + 1);
  }
  return null;
}

describe("관리자 표 최소 폭", () => {
  const files = readdirSync(ADMIN_DIR).filter((f) => f.endsWith(".tsx"));
  const withTable = files.filter((f) => readFileSync(join(ADMIN_DIR, f), "utf-8").includes("<table"));

  it("표가 있는 관리자 컴포넌트를 실제로 찾는다(가드가 헛돌지 않게)", () => {
    expect(withTable.length).toBeGreaterThanOrEqual(7);
  });

  it.each(withTable.filter((f) => !NO_MIN_WIDTH_OK.has(f)))("%s 의 모든 <table> 에 최소 폭(min-w-[Npx]·min-w-<숫자>)이 있다", (f) => {
    const classes = tableClassNames(readFileSync(join(ADMIN_DIR, f), "utf-8"));
    expect(classes.length).toBeGreaterThan(0);
    // min-w-0·min-w-full 처럼 최소 폭이 없는 값은 불합격 — 1 이상의 숫자(.5 포함)만 인정
    for (const c of classes) expect(c).toMatch(/\bmin-w-(?:\[\d+px\]|[1-9]\d*(?:\.5)?)(?![\w.-])/);
  });

  it("최소 폭 예외(SchedulerMonitor)는 여전히 좁은 폭에서 열을 숨기는 설계다 — 설계가 바뀌면 예외도 다시 본다", () => {
    const src = readFileSync(join(ADMIN_DIR, "SchedulerMonitor.tsx"), "utf-8");
    expect(src).toMatch(/hidden sm:table-cell/);
  });
});

describe("admin-mobile(관리자 대시보드 휴대폰 사진) 배선", () => {
  const config = readFileSync(join(FRONTEND, "playwright.config.ts"), "utf-8");
  const ci = readFileSync(join(FRONTEND, "..", ".github", "workflows", "ci.yml"), "utf-8");

  it("playwright project 가 로그인 산출물·setup 의존·iPhone 13 뷰포트·대시보드 spec 으로 묶여 있다", () => {
    const block = projectBlock(config, "admin-mobile");
    expect(block).not.toBeNull();
    expect(block).toMatch(/storageState:\s*"e2e\/\.auth\/admin\.json"/);
    expect(block).toMatch(/dependencies:\s*\["setup"\]/);
    expect(block).toMatch(/devices\["iPhone 13"\]/);
    expect(block).toMatch(/browserName:\s*"chromium"/);
    expect(block).toMatch(/testMatch:\s*\/admin-dashboard\\.spec\\.ts\$\//);
  });

  it("CI e2e matrix 에 admin-mobile 이 목록 항목 하나로 있다", () => {
    const line = ci.split(/\r?\n/).find((l) => /project:\s*\[/.test(l));
    expect(line).toBeDefined();
    const items = line.slice(line.indexOf("[") + 1, line.indexOf("]")).split(",").map((s) => s.trim());
    expect(items).toContain("admin-mobile");
    expect(items).toContain("admin");
  });

  it("CI 가 admin-mobile job 에도 로그인 산출물(admin-auth-state)을 내려받는다", () => {
    const lines = ci.split(/\r?\n/);
    const idx = lines.findIndex((l, i) => /name:\s*admin-auth-state/.test(l) && /download-artifact/.test(lines[i - 2] ?? ""));
    expect(idx).toBeGreaterThan(1);
    const ifLine = lines[idx - 3];
    expect(ifLine).toMatch(/matrix\.project == 'admin-mobile'/);
    expect(ifLine).toMatch(/matrix\.project == 'admin'/);
  });
});
