/**
 * check-visual-guard.mjs 단위 테스트 (세션 400)
 * 실행: npx vitest run scripts/__tests__/check-visual-guard.test.mjs
 *
 * 이 가드의 존재 이유는 "되돌림이 CI 초록인 채로 지나가는 것"을 막는 것이다. 따라서
 * **정상 상태가 통과한다**는 것만으로는 가드의 가치가 증명되지 않는다 — 각 되돌림
 * (뮤테이션)이 실제로 FAIL 하는지가 본 테스트의 핵심이다. 세션 372 교훈("테스트가
 * 있다 ≠ 그 테스트가 이 결함을 볼 수 있다") 답습.
 *
 * 뮤테이션 7종:
 *   1. ci.yml 갱신 플래그를 changed 모드로 되돌림 (`--update-snapshots`)
 *   2. ci.yml 에 `-u` 단축형 사용
 *   3. ci.yml 실행 줄은 changed 인데 **주석에만** `=all` 이 남음 (리터럴 grep 이면 거짓 PASS)
 *   4. 헤더 스냅샷 옵션을 비율 임계(maxDiffPixelRatio: 0.02)로 교체
 *   5. per-call 비율 임계를 0.05 로 완화
 *   6. per-call 비율 임계를 변수 대입으로 우회
 *   7. 헤더 스냅샷 test 를 test.skip 으로 비활성화
 * (추가: mask 재도입 / fullPage 추가 / 촬영 전 대기 제거 / config 전역·프로젝트 배선 훼손)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanVisualGuard,
  parseNumericLiteral,
  extractBraceBlock,
  stripTsComments,
  HEADER_SNAPSHOT,
} from "../check-visual-guard.mjs";

// 워커별 고유 임시 디렉터리 — check-job-labels.test.mjs 답습(세션 195 EPERM 경합).
let FIXTURE;

/** 정상 상태의 ci.yml (실행 줄이 =all) */
const CI_OK = [
  "jobs:",
  "  e2e:",
  "    strategy:",
  "      matrix:",
  "        project: [admin, public, public-visual]",
  "    steps:",
  "      # ⚠ 반드시 --update-snapshots=all — changed 모드는 파일을 안 건드린다",
  "      - name: Run E2E",
  "        run: npx playwright test --project=${{ matrix.project }} ${{ inputs.update_snapshots && '--update-snapshots=all' || '' }}",
  "",
].join("\n");

/** 정상 상태의 헤더 스냅샷 spec */
const SPEC_OK = [
  'import { test, expect } from "@playwright/test";',
  "",
  'test.describe("public visual regression", () => {',
  '  test("홈 페이지", async ({ page }) => {',
  '    await page.goto("/");',
  '    await expect(page).toHaveScreenshot("home.png", {',
  "      fullPage: true,",
  "      maxDiffPixelRatio: 0.02,",
  "    });",
  "  });",
  "",
  "  // 설명 주석에 maxDiffPixelRatio: 0.02 를 적어도 오탐이 나지 않아야 한다",
  '  test("헤더 시각 회귀 — 비로그인 데스크톱", async ({ page }) => {',
  '    await page.goto("/blog");',
  '    const header = page.locator("header").first();',
  '    await expect(header.getByRole("link", { name: "로그인" })).toBeVisible();',
  `    await expect(header).toHaveScreenshot("${HEADER_SNAPSHOT}", {`,
  "      maxDiffPixels: 100,",
  '      animations: "disabled",',
  "    });",
  "  });",
  "});",
  "",
].join("\n");

/** 정상 상태의 playwright.config.ts */
const CONFIG_OK = [
  'import { defineConfig } from "@playwright/test";',
  "",
  "export default defineConfig({",
  '  testDir: "./e2e",',
  "  expect: {",
  "    toHaveScreenshot: {",
  '      animations: "disabled",',
  "      maxDiffPixelRatio: 0.02,",
  "    },",
  "  },",
  "  projects: [",
  "    {",
  '      name: "public",',
  "      testIgnore: [/global\\.setup\\.ts$/, /public-flow\\.spec\\.ts$/],",
  "    },",
  "    {",
  '      name: "public-visual",',
  "      testMatch: /(public-flow|compare-visual)\\.spec\\.ts$/,",
  "    },",
  "  ],",
  "});",
  "",
].join("\n");

/**
 * 임시 레포 한 벌(ci.yml + e2e/*.spec.ts + playwright.config.ts)을 만들고
 * scanVisualGuard 에 넘길 경로 묶음을 돌려준다.
 */
async function makeFixture({ ci = CI_OK, spec = SPEC_OK, config = CONFIG_OK, extraSpecs = {} } = {}) {
  const wf = join(FIXTURE, ".github", "workflows");
  const e2e = join(FIXTURE, "frontend", "e2e");
  await mkdir(wf, { recursive: true });
  await mkdir(e2e, { recursive: true });

  const ciPath = join(wf, "ci.yml");
  const headerSpec = join(e2e, "public-flow.spec.ts");
  const configPath = join(FIXTURE, "frontend", "playwright.config.ts");
  await writeFile(ciPath, ci, "utf-8");
  await writeFile(headerSpec, spec, "utf-8");
  await writeFile(configPath, config, "utf-8");
  for (const [name, content] of Object.entries(extraSpecs)) {
    await writeFile(join(e2e, name), content, "utf-8");
  }
  return { ciPath, headerSpec, configPath, e2eDir: e2e };
}

/** 문제 목록을 한 문자열로 — 특정 문구 포함 여부를 보기 쉽게 */
const joined = (r) => r.problems.join("\n");

describe("check-visual-guard — 순수 파서", () => {
  it("parseNumericLiteral: 숫자 리터럴만 통과, 변수·표현식은 null", () => {
    expect(parseNumericLiteral("0.02")).toBe(0.02);
    expect(parseNumericLiteral(" 100 ")).toBe(100);
    expect(parseNumericLiteral(".5")).toBe(0.5);
    expect(parseNumericLiteral("RATIO")).toBeNull();
    expect(parseNumericLiteral("0.01 * 2")).toBeNull();
    expect(parseNumericLiteral("Number(x)")).toBeNull();
  });

  it("extractBraceBlock: 문자열 속 중괄호를 세지 않는다", () => {
    const src = 'f({ a: "}{", b: { c: 1 } })';
    expect(extractBraceBlock(src, 0)).toBe('{ a: "}{", b: { c: 1 } }');
  });

  it("stripTsComments: 주석을 지우되 오프셋(길이)을 보존한다", () => {
    const src = 'const a = 1; // maxDiffPixelRatio: 0.9\nconst b = 2;';
    const out = stripTsComments(src);
    expect(out.length).toBe(src.length);
    expect(out).not.toContain("maxDiffPixelRatio");
    expect(out).toContain("const b = 2;");
  });

  it("stripTsComments: 블록 주석 안의 옵션 예시도 제거한다", () => {
    const out = stripTsComments("/* mask: [x] */ const y = 1;");
    expect(out).not.toContain("mask");
    expect(out).toContain("const y = 1;");
  });
});

describe("check-visual-guard — 정상 상태", () => {
  beforeEach(async () => {
    FIXTURE = await mkdtemp(join(tmpdir(), "visualguard-"));
  });
  afterEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  it("정상 fixture 는 문제 0건", async () => {
    const f = await makeFixture();
    const r = await scanVisualGuard(f);
    expect(r.problems).toEqual([]);
  });

  it("설명 주석에 적힌 옵션 예시는 오탐을 내지 않는다", async () => {
    const spec = SPEC_OK.replace(
      '  // 설명 주석에 maxDiffPixelRatio: 0.02 를 적어도 오탐이 나지 않아야 한다',
      [
        "  /**",
        "   * 참고: 다른 장은 maxDiffPixelRatio: 0.02 · mask: [page.locator('#x')] · fullPage: true 를 쓴다.",
        "   * threshold: 0.9 같은 값도 주석이면 무해해야 한다.",
        "   */",
      ].join("\n"),
    );
    const f = await makeFixture({ spec });
    const r = await scanVisualGuard(f);
    expect(r.problems).toEqual([]);
  });
});

describe("check-visual-guard — 뮤테이션 7종이 실제로 FAIL 한다", () => {
  beforeEach(async () => {
    FIXTURE = await mkdtemp(join(tmpdir(), "visualguard-"));
  });
  afterEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  /**
   * 뮤테이션 1 — 갱신 플래그를 changed 모드로 되돌림(#498 실사고 재현).
   *
   * ⚠ 여기서 `CI_OK.replace("--update-snapshots=all", …)` 를 쓰면 **주석의 첫 등장이
   *   바뀌고 실행 줄은 그대로**여서 뮤테이션이 성립하지 않는다(String.replace 는 첫
   *   일치만 바꾼다) — 실제로 이 테스트를 처음 돌렸을 때 그 이유로 통과해 버렸다.
   *   반드시 `run:` 줄을 지목해 바꾼다.
   */
  it("① ci.yml 갱신 플래그가 '--update-snapshots'(changed) 로 되돌아가면 FAIL", async () => {
    const ci = CI_OK.replace(
      "run: npx playwright test --project=${{ matrix.project }} ${{ inputs.update_snapshots && '--update-snapshots=all' || '' }}",
      "run: npx playwright test --project=${{ matrix.project }} ${{ inputs.update_snapshots && '--update-snapshots' || '' }}",
    );
    const f = await makeFixture({ ci });
    const r = await scanVisualGuard(f);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(joined(r)).toMatch(/update-snapshots=all/);
  });

  /** 뮤테이션 2 — `-u` 단축형(값 생략 시 changed) */
  it("② ci.yml 에 '-u' 단축형을 쓰면 FAIL", async () => {
    const f = await makeFixture({ ci: CI_OK.replace("'--update-snapshots=all'", "'-u'") });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/-u/);
  });

  /**
   * 뮤테이션 3 — 가장 위험한 되돌림: **주석에만** `=all` 이 남고 실행 줄은 changed.
   * 리터럴 grep 가드라면 여기서 거짓 PASS 가 난다.
   */
  it("③ 주석에만 '=all' 이 남고 실행 줄은 changed 면 FAIL (리터럴 grep 거짓 PASS 차단)", async () => {
    const ci = CI_OK.replace(
      "run: npx playwright test --project=${{ matrix.project }} ${{ inputs.update_snapshots && '--update-snapshots=all' || '' }}",
      "run: npx playwright test --project=${{ matrix.project }} ${{ inputs.update_snapshots && '--update-snapshots' || '' }}",
    );
    expect(ci).toContain("--update-snapshots=all"); // 주석에는 여전히 남아 있다
    const f = await makeFixture({ ci });
    const r = await scanVisualGuard(f);
    expect(r.problems.length).toBeGreaterThan(0);
  });

  /** 뮤테이션 4 — 헤더 스냅샷을 비율 임계로 교체(좁은 프레임의 의미 소멸) */
  it("④ 헤더 스냅샷 옵션을 maxDiffPixelRatio: 0.02 로 바꾸면 FAIL", async () => {
    const f = await makeFixture({
      spec: SPEC_OK.replace("      maxDiffPixels: 100,", "      maxDiffPixelRatio: 0.02,"),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/maxDiffPixelRatio/);
  });

  /** 뮤테이션 5 — per-call 비율 임계 완화 */
  it("⑤ per-call maxDiffPixelRatio 가 0.05 면 FAIL", async () => {
    const f = await makeFixture({
      extraSpecs: {
        "other-visual.spec.ts": [
          'import { test, expect } from "@playwright/test";',
          'test("x", async ({ page }) => {',
          '  await expect(page).toHaveScreenshot("x.png", { fullPage: true, maxDiffPixelRatio: 0.05 });',
          "});",
        ].join("\n"),
      },
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/0\.05/);
  });

  /** 뮤테이션 6 — 변수 대입으로 임계 우회(정적으로 값을 못 보게 만드는 수법) */
  it("⑥ per-call 임계를 변수로 우회하면 FAIL", async () => {
    const f = await makeFixture({
      extraSpecs: {
        "other-visual.spec.ts": [
          'import { test, expect } from "@playwright/test";',
          "const RATIO = 0.5;",
          'test("x", async ({ page }) => {',
          '  await expect(page).toHaveScreenshot("x.png", { maxDiffPixelRatio: RATIO });',
          "});",
        ].join("\n"),
      },
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/숫자 리터럴이 아니다/);
  });

  /** 뮤테이션 7 — 헤더 test 자체를 비활성화 */
  it("⑦ 헤더 스냅샷 test 를 test.skip 으로 바꾸면 FAIL", async () => {
    const f = await makeFixture({
      spec: SPEC_OK.replace(
        '  test("헤더 시각 회귀 — 비로그인 데스크톱"',
        '  test.skip("헤더 시각 회귀 — 비로그인 데스크톱"',
      ),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/test\.skip/);
  });
});

describe("check-visual-guard — 추가 되돌림 경로", () => {
  beforeEach(async () => {
    FIXTURE = await mkdtemp(join(tmpdir(), "visualguard-"));
  });
  afterEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  it("헤더 스냅샷 호출이 아예 사라지면 FAIL", async () => {
    const f = await makeFixture({ spec: SPEC_OK.replace(HEADER_SNAPSHOT, "something-else.png") });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toContain(HEADER_SNAPSHOT);
  });

  it("헤더 스냅샷에 mask 를 재도입하면 FAIL", async () => {
    const f = await makeFixture({
      spec: SPEC_OK.replace("      maxDiffPixels: 100,", '      maxDiffPixels: 100,\n      mask: [page.locator("#x")],'),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/mask/);
  });

  it("헤더 스냅샷에 fullPage 를 넣으면 FAIL (분모가 다시 커진다)", async () => {
    const f = await makeFixture({
      spec: SPEC_OK.replace("      maxDiffPixels: 100,", "      maxDiffPixels: 100,\n      fullPage: true,"),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/fullPage/);
  });

  it("헤더 스냅샷 maxDiffPixels 가 상한(200)을 넘으면 FAIL", async () => {
    const f = await makeFixture({ spec: SPEC_OK.replace("maxDiffPixels: 100", "maxDiffPixels: 5000") });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/5000/);
  });

  it("촬영 전 toBeVisible 대기를 제거하면 FAIL (hydration 전이 프레임 위험)", async () => {
    const f = await makeFixture({
      spec: SPEC_OK.replace(
        '    await expect(header.getByRole("link", { name: "로그인" })).toBeVisible();\n',
        "",
      ),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/toBeVisible/);
  });

  it("전역 maxDiffPixelRatio 를 올리면 FAIL", async () => {
    const f = await makeFixture({
      config: CONFIG_OK.replace("      maxDiffPixelRatio: 0.02,", "      maxDiffPixelRatio: 0.1,"),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/0\.1/);
  });

  it("public-visual 의 testMatch 가 public-flow 를 더 이상 매칭하지 않으면 FAIL", async () => {
    const f = await makeFixture({
      config: CONFIG_OK.replace(
        "testMatch: /(public-flow|compare-visual)\\.spec\\.ts$/,",
        "testMatch: /(compare-visual)\\.spec\\.ts$/,",
      ),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/public-flow\.spec\.ts 를 매칭하지 않는다/);
  });

  it("testMatch 표기가 달라도 실제 매칭되면 통과한다 (문자열 비교가 아님)", async () => {
    const f = await makeFixture({
      config: CONFIG_OK.replace(
        "testMatch: /(public-flow|compare-visual)\\.spec\\.ts$/,",
        "testMatch: /public-(flow|other)\\.spec\\.ts$/,",
      ),
    });
    const r = await scanVisualGuard(f);
    expect(r.problems).toEqual([]);
  });

  it("public 의 testIgnore 에서 public-flow 를 빼면 FAIL (접미사 이중 생성)", async () => {
    const f = await makeFixture({
      config: CONFIG_OK.replace(
        "testIgnore: [/global\\.setup\\.ts$/, /public-flow\\.spec\\.ts$/],",
        "testIgnore: [/global\\.setup\\.ts$/],",
      ),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/testIgnore/);
  });

  it("e2e matrix 에서 public-visual 을 빼면 FAIL (CI 에서 헤더 장이 안 돎)", async () => {
    const f = await makeFixture({
      ci: CI_OK.replace("project: [admin, public, public-visual]", "project: [admin, public]"),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/public-visual/);
  });

  it("--ignore-snapshots 를 넣으면 FAIL", async () => {
    const f = await makeFixture({
      ci: CI_OK.replace("--project=${{ matrix.project }}", "--project=${{ matrix.project }} --ignore-snapshots"),
    });
    const r = await scanVisualGuard(f);
    expect(joined(r)).toMatch(/ignore-snapshots/);
  });

  /** 가드가 실제 레포를 볼 때도 동작하는지 — 파서 살아있음 확인 */
  it("실제 레포 상태를 스캔하면 문제 0건 (가드 자체가 헛돌지 않음)", async () => {
    const r = await scanVisualGuard();
    expect(r.problems).toEqual([]);
  });
});
