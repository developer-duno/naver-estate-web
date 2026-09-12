#!/usr/bin/env node
/**
 * 시각회귀 안전망 되돌림 가드 (세션 400)
 *
 * 배경: 시각회귀(toHaveScreenshot) 안전망은 **조용히 무력화되는 성질**이 있다. 임계를
 * 올리거나 mask 를 넣거나 갱신 플래그를 되돌려도 CI 는 초록이라, 깨진 사실 자체가
 * 안 보인다. 세션 398~400 에 실제로 세 번 겪었다:
 *   ① `--update-snapshots`(값 없음 = changed 모드)는 허용오차 안이면 PNG 를 아예 안
 *      건드린다 → 갱신 dispatch 가 옛 파일을 그대로 artifact 에 담아 "변경 없음"으로
 *      오판(#498 dispatch run 34699999010 의 3 job 로그에 `is re-generated` 줄 0건).
 *   ② mask 로 "flaky 해결"이라 보고했다가 적대검증이 실험으로 반증(mask 는 fullPage
 *      높이를 고정하지 못한다).
 *   ③ 전 페이지 공유 헤더의 메뉴 1개 변경이 비율 임계(0.02)에 구조적으로 안 걸린다 →
 *      헤더 전용 좁은 스냅샷을 신설.
 * ⇒ 이 세 처방이 나중에 되돌아가는 것을 사람 눈이 아니라 CI 가 막는다.
 *
 * ⚠ 설계 원칙 — **리터럴 grep 금지, "효력 위치"로 앵커링**한다.
 *   `ci.yml` 에 `=all` 이라는 글자가 있는지만 보면, 주석에만 남고 실제 run 줄은
 *   되돌아간 상태에서 **거짓 PASS** 가 난다(이 방향의 오류가 가장 위험하다 — 가드가
 *   있다고 믿는데 없는 상태). 그래서:
 *     - ci.yml 은 주석줄을 제거한 뒤 `run:` 이면서 `playwright test` 를 포함한 줄만 본다.
 *     - spec 은 해당 toHaveScreenshot 호출의 **옵션 블록 `{…}` 안**만 파싱한다.
 *     - 임계값은 **숫자 리터럴만** 인정한다(변수 대입으로 우회하면 FAIL).
 *
 * 실행: node scripts/check-visual-guard.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/** 헤더 전용 스냅샷 — 이 가드가 지키는 대상 */
export const HEADER_SNAPSHOT = "header-public-desktop.png";
/** 헤더 스냅샷의 절대 픽셀 임계 상한 (안티앨리어싱 완충 범위를 넘으면 안전망이 헐거워짐) */
export const HEADER_MAX_DIFF_PIXELS_CAP = 200;
/** per-call 비율 임계 상한 = 전역값. 이보다 느슨해지면 "레이아웃 붕괴"조차 놓친다 */
export const RATIO_CAP = 0.02;
/** threshold(픽셀 색차 허용) 상한 — 기본 0.2 보다 느슨해지면 안 됨 */
export const THRESHOLD_CAP = 0.2;

const DEFAULTS = {
  ciPath: "../.github/workflows/ci.yml",
  e2eDir: "e2e",
  headerSpec: "e2e/public-flow.spec.ts",
  configPath: "playwright.config.ts",
};

/** 숫자 리터럴만 통과 (변수·표현식 우회 차단). 반환: number | null */
export function parseNumericLiteral(raw) {
  const t = String(raw).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * 문자열 내 `start` 위치의 `{` 부터 짝이 맞는 `}` 까지를 돌려준다.
 * 문자열 리터럴·주석 안의 중괄호를 세지 않도록 최소한의 상태기를 둔다.
 */
export function extractBraceBlock(src, fromIndex) {
  const open = src.indexOf("{", fromIndex);
  if (open === -1) return null;
  let depth = 0;
  let i = open;
  let mode = "code"; // code | sq | dq | tpl | line | block
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") mode = "line";
      else if (c === "/" && next === "*") mode = "block";
      else if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return src.slice(open, i + 1);
      }
    } else if (mode === "line") {
      if (c === "\n") mode = "code";
    } else if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code";
        i++;
      }
    } else if (mode === "sq" || mode === "dq" || mode === "tpl") {
      if (c === "\\") i++;
      else if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
        mode = "code";
      }
    }
    i++;
  }
  return null;
}

/** `#` 줄 주석(YAML)을 제거한 줄 배열 — 주석 속 문자열의 거짓 PASS 차단 */
function stripYamlComments(src) {
  return src
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ""));
}

/**
 * TS/JS 주석(`//`, `/* *\/`)을 같은 길이의 공백으로 바꿔 제거한다.
 *
 * ⚠ 이게 없으면 **양방향으로 틀린다**: 주석에 설명용으로 적은
 * `maxDiffPixelRatio: 0.02` 가 실제 옵션으로 오인돼 오탐이 나고(실제로 이 가드를 처음
 * 돌렸을 때 헤더 test 의 설명 주석이 걸렸다), 반대로 주석에만 안전한 값을 적어두고
 * 실제 옵션은 느슨하게 두는 거짓 PASS 도 가능해진다. 길이를 보존해 오프셋이 안 밀리게 한다.
 */
export function stripTsComments(src) {
  let out = "";
  let mode = "code"; // code | line | block | sq | dq | tpl
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line";
        out += "  ";
        i++;
      } else if (c === "/" && next === "*") {
        mode = "block";
        out += "  ";
        i++;
      } else {
        if (c === "'") mode = "sq";
        else if (c === '"') mode = "dq";
        else if (c === "`") mode = "tpl";
        out += c;
      }
    } else if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += c;
      } else out += " ";
    } else if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code";
        out += "  ";
        i++;
      } else out += c === "\n" ? c : " ";
    } else {
      // 문자열 리터럴 내부 — 그대로 보존(이스케이프는 한 글자 건너뛴다)
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i++;
      } else if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
        mode = "code";
      }
    }
  }
  return out;
}

/**
 * 규칙 1 — ci.yml: **실제로 실행되는 줄**에서만 갱신 플래그를 본다.
 * 주석을 제거한 뒤 `run:` + `playwright test` 를 포함한 줄만 대상.
 */
export async function checkCi(ciPath = DEFAULTS.ciPath) {
  const problems = [];
  const src = await readFile(ciPath, "utf-8");
  const lines = stripYamlComments(src);
  // ⚠ `run:` 과 `playwright test` 가 **같은 줄**이어야 잡는다. 명령이 길어져 YAML 블록
  //   스타일(`run: |` + 다음 줄에 명령)로 바꾸면 이 필터가 0건이 되어 "형태가 바뀌었다"로
  //   FAIL 한다(거짓 PASS 가 아니라 거짓 FAIL = fail-safe, 세션 400 적대검증 MEDIUM-1).
  //   블록 스타일로 옮길 거면 이 가드도 함께 고칠 것 — 여기 필터를 줄 단위가 아니라
  //   step 단위(js-yaml 파싱 또는 주석 제거 후 전문 결합)로 바꾸면 된다.
  const runLines = lines.filter((l) => /\brun:/.test(l) && /playwright\s+test/.test(l));

  if (runLines.length === 0) {
    problems.push(
      `${ciPath}: 'playwright test' 를 실행하는 run 줄을 찾지 못했다 — e2e step 이 사라졌거나 형태가 바뀌었다` +
        ` (YAML 블록 스타일 'run: |' 로 바꿨다면 이 가드의 runLines 필터도 함께 고쳐야 한다).`,
    );
    return problems;
  }

  const joined = runLines.join("\n");

  // 갱신 플래그가 = all 인지. 값 없는 형태(changed)는 파일을 안 건드린다.
  if (!/--update-snapshots=all/.test(joined)) {
    problems.push(
      `${ciPath}: 갱신 플래그가 '--update-snapshots=all' 이 아니다.\n` +
        `    값 없는 '--update-snapshots'(changed 모드)는 허용오차 안이면 PNG 를 갱신하지 않아\n` +
        `    갱신 dispatch 가 옛 baseline 을 그대로 artifact 에 담는다(#498 실사고).`,
    );
  }
  if (/--update-snapshots(?!=all)/.test(joined)) {
    problems.push(
      `${ciPath}: 값 없는(또는 =all 이 아닌) '--update-snapshots' 가 실행 줄에 남아 있다.`,
    );
  }
  // `-u` 단축형은 값을 optional 로 받아(choices all/changed/missing) 값 없이 쓰면 changed.
  if (/\B-u\b/.test(joined) || /\s-u(?:\s|$|=)/.test(joined)) {
    problems.push(
      `${ciPath}: '-u' 단축형이 쓰였다 — 값을 생략하면 changed 모드가 되어 위와 같은 함정에 빠진다.\n` +
        `    '--update-snapshots=all' 로 명시할 것.`,
    );
  }
  if (/--ignore-snapshots/.test(joined)) {
    problems.push(`${ciPath}: '--ignore-snapshots' 가 쓰였다 — 시각회귀 비교가 통째로 꺼진다.`);
  }

  // 헤더 스냅샷이 실행되는 프로젝트가 matrix 에 있는지 (없으면 CI 에서 아예 안 돎)
  const matrixLine = lines.find((l) => /project:\s*\[/.test(l));
  if (!matrixLine || !/public-visual/.test(matrixLine)) {
    problems.push(
      `${ciPath}: e2e matrix 의 project 목록에 'public-visual' 이 없다 —\n` +
        `    헤더 전용 스냅샷(${HEADER_SNAPSHOT})이 CI 에서 실행되지 않는다.`,
    );
  }
  return problems;
}

/**
 * 규칙 2 — 헤더 스냅샷 test: 옵션 블록 안만 파싱해 임계·mask·fullPage·skip·대기를 본다.
 */
export async function checkHeaderSnapshot(headerSpec = DEFAULTS.headerSpec) {
  const problems = [];
  // 주석 제거 후 파싱 — 설명 주석의 옵션 예시를 실제 옵션으로 오인/오통과하지 않도록.
  const src = stripTsComments(await readFile(headerSpec, "utf-8"));

  const callIdx = src.indexOf(`toHaveScreenshot("${HEADER_SNAPSHOT}"`);
  if (callIdx === -1) {
    problems.push(
      `${headerSpec}: 헤더 전용 스냅샷 호출 toHaveScreenshot("${HEADER_SNAPSHOT}") 이 없다.\n` +
        `    비율 임계(0.02)로는 헤더급 변경을 구조적으로 못 잡으므로 이 장이 유일한 감시 수단이다.`,
    );
    return problems;
  }

  const block = extractBraceBlock(src, callIdx);
  if (!block) {
    problems.push(`${headerSpec}: 헤더 스냅샷 호출의 옵션 블록 {…} 을 파싱하지 못했다.`);
    return problems;
  }

  // maxDiffPixels — 숫자 리터럴만 인정
  const mdp = block.match(/\bmaxDiffPixels\s*:\s*([^,\s}]+)/);
  if (!mdp) {
    problems.push(
      `${headerSpec}: 헤더 스냅샷 옵션에 maxDiffPixels 가 없다 —\n` +
        `    전역 비율 임계(${RATIO_CAP})만 적용되면 좁은 프레임의 의미가 사라진다.`,
    );
  } else {
    const v = parseNumericLiteral(mdp[1]);
    if (v === null) {
      problems.push(
        `${headerSpec}: maxDiffPixels 가 숫자 리터럴이 아니다('${mdp[1]}') — 변수 우회는 가드가 값을 못 본다.`,
      );
    } else if (v > HEADER_MAX_DIFF_PIXELS_CAP) {
      problems.push(
        `${headerSpec}: maxDiffPixels=${v} 가 상한 ${HEADER_MAX_DIFF_PIXELS_CAP} 을 넘는다 — 안전망이 헐거워진다.`,
      );
    }
  }

  // 비율 임계로 갈아끼우는 되돌림 — 좁은 프레임을 무의미하게 만든다
  const ratio = block.match(/\bmaxDiffPixelRatio\s*:\s*([^,\s}]+)/);
  if (ratio) {
    problems.push(
      `${headerSpec}: 헤더 스냅샷 옵션에 maxDiffPixelRatio(${ratio[1]}) 가 들어갔다 —\n` +
        `    비율 임계는 프레임 면적에 비례해 메뉴 1개 변경을 놓친다. 절대 픽셀(maxDiffPixels)만 쓸 것.`,
    );
  }

  if (/\bmask\s*:/.test(block)) {
    problems.push(
      `${headerSpec}: 헤더 스냅샷에 mask 가 추가됐다 — 가려진 영역은 감시에서 빠진다.`,
    );
  }

  // 헤더만 잘라 찍는 것이 이 장의 요점 — fullPage 면 분모가 다시 커진다
  if (/\bfullPage\s*:/.test(block)) {
    problems.push(
      `${headerSpec}: 헤더 스냅샷에 fullPage 가 들어갔다 — 좁은 프레임(헤더 띠)이라야 메뉴 1개 변경이 감지된다.`,
    );
  }

  const th = block.match(/\bthreshold\s*:\s*([^,\s}]+)/);
  if (th) {
    const v = parseNumericLiteral(th[1]);
    if (v === null) {
      problems.push(`${headerSpec}: 헤더 스냅샷 threshold 가 숫자 리터럴이 아니다('${th[1]}').`);
    } else if (v > THRESHOLD_CAP) {
      problems.push(`${headerSpec}: 헤더 스냅샷 threshold=${v} 가 상한 ${THRESHOLD_CAP} 을 넘는다.`);
    }
  }

  // 그 test 블록 자체가 비활성화되지 않았는지 + 촬영 전 대기가 있는지
  const testStart = src.lastIndexOf("test(", callIdx);
  const skipStart = src.lastIndexOf("test.skip", callIdx);
  const fixmeStart = src.lastIndexOf("test.fixme", callIdx);
  const bodyStart = Math.max(testStart, skipStart, fixmeStart);
  if (skipStart > -1 && skipStart === bodyStart) {
    problems.push(`${headerSpec}: 헤더 스냅샷 test 가 test.skip 으로 비활성화됐다.`);
  }
  if (fixmeStart > -1 && fixmeStart === bodyStart) {
    problems.push(`${headerSpec}: 헤더 스냅샷 test 가 test.fixme 로 비활성화됐다.`);
  }

  const preamble = src.slice(bodyStart === -1 ? 0 : bodyStart, callIdx);
  if (/\btest\.skip\s*\(/.test(preamble) || /\btest\.fixme\s*\(/.test(preamble)) {
    problems.push(`${headerSpec}: 헤더 스냅샷 test 본문에 test.skip/test.fixme 조건 이탈이 들어갔다.`);
  }
  if (!/toBeVisible\s*\(/.test(preamble)) {
    problems.push(
      `${headerSpec}: 헤더 스냅샷 촬영 전 toBeVisible 대기가 없다 —\n` +
        `    hydration 전이 프레임(placeholder)이 baseline 으로 굳을 수 있다(Header.tsx mounted 게이트).`,
    );
  }
  return problems;
}

async function listSpecs(e2eDir) {
  const entries = await readdir(e2eDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".spec.ts"))
    .map((e) => join(e2eDir, e.name))
    .sort();
}

/**
 * 규칙 3 — e2e 전수: per-call 임계가 숫자 리터럴이면서 전역 상한 이하인지.
 * 변수 대입은 값을 정적으로 못 보므로 그 자체로 FAIL(우회 경로를 남기지 않는다).
 */
export async function checkPerCallThresholds(e2eDir = DEFAULTS.e2eDir) {
  const problems = [];
  for (const spec of await listSpecs(e2eDir)) {
    const src = stripTsComments(await readFile(spec, "utf-8"));
    const rel = relative(".", spec).replace(/\\/g, "/");

    for (const m of src.matchAll(/\bmaxDiffPixelRatio\s*:\s*([^,\s}]+)/g)) {
      const v = parseNumericLiteral(m[1]);
      if (v === null) {
        problems.push(
          `${rel}: maxDiffPixelRatio 가 숫자 리터럴이 아니다('${m[1]}') —\n` +
            `    변수·표현식으로 두면 가드가 실제 임계를 확인할 수 없다.`,
        );
      } else if (v > RATIO_CAP) {
        problems.push(`${rel}: maxDiffPixelRatio=${v} 가 상한 ${RATIO_CAP} 을 넘는다.`);
      }
    }
    for (const m of src.matchAll(/\bthreshold\s*:\s*([^,\s}]+)/g)) {
      const v = parseNumericLiteral(m[1]);
      if (v === null) {
        problems.push(`${rel}: threshold 가 숫자 리터럴이 아니다('${m[1]}').`);
      } else if (v > THRESHOLD_CAP) {
        problems.push(`${rel}: threshold=${v} 가 상한 ${THRESHOLD_CAP} 을 넘는다.`);
      }
    }
  }
  return problems;
}

/**
 * 규칙 4 — playwright.config.ts: 전역 임계 고정 + 헤더 스냅샷이 도는 프로젝트 배선 유지.
 * testMatch 정규식은 문자열 비교가 아니라 **실제로 매칭시켜** 확인한다(표기가 바뀌어도 통과).
 */
export async function checkConfig(configPath = DEFAULTS.configPath) {
  const problems = [];
  const src = stripTsComments(await readFile(configPath, "utf-8"));

  const ratio = src.match(/\bmaxDiffPixelRatio\s*:\s*([^,\s}]+)/);
  if (!ratio) {
    problems.push(`${configPath}: 전역 expect.toHaveScreenshot.maxDiffPixelRatio 가 없다.`);
  } else {
    const v = parseNumericLiteral(ratio[1]);
    if (v === null) {
      problems.push(`${configPath}: 전역 maxDiffPixelRatio 가 숫자 리터럴이 아니다('${ratio[1]}').`);
    } else if (v !== RATIO_CAP) {
      problems.push(
        `${configPath}: 전역 maxDiffPixelRatio=${v} — ${RATIO_CAP} 로 고정돼 있어야 한다\n` +
          `    (레이아웃 붕괴 감지 전용 임계. 올리면 붕괴조차 통과하고, 내리면 19장이 전부 flaky 가 된다).`,
      );
    }
  }

  // public-visual 프로젝트의 testMatch 가 public-flow.spec.ts 를 실제로 매칭하는지
  const pvIdx = src.indexOf('name: "public-visual"');
  if (pvIdx === -1) {
    problems.push(`${configPath}: 'public-visual' 프로젝트 정의가 없다 — 헤더 스냅샷이 실행될 곳이 사라졌다.`);
  } else {
    const tm = src.slice(pvIdx).match(/testMatch:\s*\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)/);
    if (!tm) {
      problems.push(`${configPath}: 'public-visual' 의 testMatch 정규식을 파싱하지 못했다.`);
    } else {
      let matched = false;
      try {
        matched = new RegExp(tm[1], tm[2]).test("e2e/public-flow.spec.ts");
      } catch {
        problems.push(`${configPath}: 'public-visual' testMatch 정규식이 유효하지 않다(/${tm[1]}/${tm[2]}).`);
      }
      if (!matched) {
        problems.push(
          `${configPath}: 'public-visual' 의 testMatch(/${tm[1]}/) 가 public-flow.spec.ts 를 매칭하지 않는다 —\n` +
            `    헤더 스냅샷이 어느 프로젝트에서도 실행되지 않는다.`,
        );
      }
    }
  }

  // public 프로젝트가 public-flow 를 무시해야 한다(안 그러면 -public-linux.png 가 이중 생성돼
  // 꾸러미 접미사 필터가 전제로 삼는 1:1 대응이 깨진다)
  const pIdx = src.indexOf('name: "public"');
  if (pIdx === -1) {
    problems.push(`${configPath}: 'public' 프로젝트 정의가 없다.`);
  } else {
    // ⚠ 반드시 **'public' 프로젝트 블록 안에서만** testIgnore 를 찾는다.
    //   전역에서 indexOf 로 찾으면 그 프로젝트에 testIgnore 가 없어진 뒤에도 다른
    //   프로젝트의 것을 집어 거짓 PASS 가 난다(단위 테스트가 실제로 이 결함을 잡았다).
    const pEnd = pvIdx > pIdx ? pvIdx : src.length;
    const pBlock = src.slice(pIdx, pEnd);
    const tiIdx = pBlock.indexOf("testIgnore");
    // testIgnore 의 값은 배열 리터럴이라 `[` … `]` 로 잘라야 한다(중괄호 아님).
    let ignoreSrc = "";
    if (tiIdx !== -1) {
      const open = pBlock.indexOf("[", tiIdx);
      const close = open === -1 ? -1 : pBlock.indexOf("]", open);
      ignoreSrc = open !== -1 && close !== -1 ? pBlock.slice(open, close + 1) : pBlock.slice(tiIdx);
    }
    let ignored = false;
    for (const m of ignoreSrc.matchAll(/\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)/g)) {
      try {
        if (new RegExp(m[1], m[2]).test("e2e/public-flow.spec.ts")) ignored = true;
      } catch {
        /* 정규식이 아닌 토큰은 무시 */
      }
    }
    if (!ignored) {
      problems.push(
        `${configPath}: 'public' 프로젝트의 testIgnore 가 public-flow.spec.ts 를 더 이상 제외하지 않는다 —\n` +
          `    같은 스냅샷이 public·public-visual 양쪽에서 접미사만 다르게 생성돼 baseline 대조가 어긋난다.`,
      );
    }
  }
  return problems;
}

export async function scanVisualGuard(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const problems = [
    ...(await checkCi(o.ciPath)),
    ...(await checkHeaderSnapshot(o.headerSpec)),
    ...(await checkPerCallThresholds(o.e2eDir)),
    ...(await checkConfig(o.configPath)),
  ];
  return { problems };
}

const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("check-visual-guard.mjs");

if (isMain) {
  const { problems } = await scanVisualGuard();
  if (problems.length === 0) {
    console.log(
      "✅ 시각회귀 안전망 정상 — 갱신 플래그(=all) · 헤더 전용 스냅샷 임계 · per-call 비율 임계 · 전역 설정/프로젝트 배선",
    );
    process.exit(0);
  }
  console.error(`🔴 시각회귀 안전망이 무력화됐다 — ${problems.length}건:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    `\n이 항목들은 어겨도 CI 가 초록이라 사람 눈에 안 보인다(세션 398~400 에 세 번 겪음).\n` +
      `배경·판정 절차 = .claude/rules/testing.md §시각 회귀.`,
  );
  process.exit(1);
}
