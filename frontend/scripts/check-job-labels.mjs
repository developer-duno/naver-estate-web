#!/usr/bin/env node
/**
 * job_type 한글 이름표 정합 가드 (세션 399 · 백로그 §11 A1)
 *
 * 배경: 관리자 화면 3곳(CrawlJobTable · FailureBreakdown · AdminLivePanel)이
 * crawl-job-labels.ts 의 사전을 거쳐 작업 종류를 한글로 보여준다. 사전에 없는
 * 코드는 `jobTypeLabel()` 이 코드 원문을 그대로 돌려주므로(안전 폴백) 화면에
 * 영문이 노출된다 — 사장님 지적 "어려운 말 너무 많다"의 실체 중 하나.
 *
 * 세션 399 실측: 사전 11종 vs 최근 30일 실제 발생 24종 → 15종이 영문 노출 중.
 * 그중 9종(complex_detail_* 5 · kapt_match · kapt_costs · api_version_probe ·
 * official_price)은 인계 블록의 "6종" 목록에도 빠져 있었다. 이유 = 그 목록이
 * 문자열 리터럴 grep 으로 만들어졌는데, complex_detail_* 는 f-string 으로
 * 조립되고 kapt_* 는 모듈 상수를 거쳐 리터럴 검색에 안 잡히기 때문.
 * → 사람이 눈으로 세는 방식 자체가 실패했으므로 CI 가 기계적으로 센다.
 *
 * 검사 방식: backend 소스에서 CrawlJob 에 실제로 쓰이는 job_type 을 추출해
 * (리터럴 + 선언된 동적 패턴 전개 + 모듈 상수) 사전 키와 대조. 빠진 게 있으면
 * 그 이름을 찍고 exit 1.
 *
 * ⚠ 동적 job_type 취급이 BE 의 extract_scheduler_job_ids() 와 정반대다.
 *   그쪽은 동적 id 를 "오탐 없이 건너뛴다"(감시 대상에서 제외). 이쪽은 건너뛰면
 *   바로 그 9종을 또 놓치므로, 동적 패턴을 DYNAMIC_JOB_TYPES 에 명시 선언해
 *   전개한다. 선언되지 않은 새 f-string 이 생기면 UNDECLARED 로 실패시켜
 *   "조용히 새는" 경로를 남기지 않는다.
 *
 * 실행: node scripts/check-job-labels.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const BACKEND_DIR = "../backend";

// ⚠ job_type 은 대문자를 포함한다(complex_detail_APT/OPST/JGC/ABYG/OBYG).
//   [a-z0-9_]+ 로만 잡으면 그 5종을 통째로 놓친다 — 세션 399 구현 중 실제로 겪은 함정.
const JOB_TYPE_CHARS = "[A-Za-z0-9_]+";

/** job_type="literal" — 가장 흔한 형태 */
const LITERAL_RE = new RegExp(`job_type\\s*=\\s*"(${JOB_TYPE_CHARS})"`, "g");

/** job_type=f"prefix_{var}" — 리터럴 grep 이 못 보는 형태 */
const FSTRING_RE = /job_type\s*=\s*f"([A-Za-z0-9_]*)\{([a-z_]+)\}"/g;

/** job_type=_MODULE_CONST — 상수 경유 (service_kapt.py 패턴) */
const CONST_RE = /job_type\s*=\s*(_[A-Z][A-Z0-9_]*)/g;
/** _MODULE_CONST = "value" 선언 */
const CONST_DECL_RE = new RegExp(`^(_[A-Z][A-Z0-9_]*)\\s*=\\s*"(${JOB_TYPE_CHARS})"`, "gm");

/**
 * _record_job(db, <job_type>, <scheduler_job_id>) — 위치 인자 형태.
 *
 * env_common.py 의 공용 헬퍼로, 두 번째 위치 인자가 job_type 이다. `job_type=`
 * 이라는 글자가 호출부에 없어서 위 패턴들이 전부 못 본다 — official_price ·
 * kapt_match · kapt_costs · api_version_probe 4종이 이 경로라 세션 399 최초
 * 구현에서 누락됐다(사람이 센 15 vs 스크립트가 센 11 의 차이가 정확히 이것).
 * 리터럴과 상수 경유 둘 다 받는다.
 */
const RECORD_JOB_RE = new RegExp(
  `_record_job\\(\\s*[A-Za-z_][A-Za-z0-9_]*\\s*,\\s*(?:"(${JOB_TYPE_CHARS})"|(_[A-Z][A-Z0-9_]*))`,
  "g",
);

/**
 * 동적 job_type 의 전개 목록 — f-string 접두사 → 실제 조합되는 전체 코드.
 *
 * complex_detail_{real_estate_type} 은 scheduler.py 가 APT·OPST 를 개별
 * add_job 으로, JGC·ABYG·OBYG 를 루프로 등록한다(총 5종). 소스 파싱만으로는
 * 루프 변수를 안전하게 펼칠 수 없어 여기 선언으로 고정한다.
 * 새 유형이 생기면 이 목록과 사전 양쪽을 갱신해야 하며, 빠뜨리면 아래
 * UNDECLARED 검사가 잡는다.
 */
const DYNAMIC_JOB_TYPES = {
  complex_detail_: ["APT", "OPST", "JGC", "ABYG", "OBYG"],
};

/**
 * 사전에 없어도 되는 job_type — 화면에 뜨더라도 이름표가 불필요하거나
 * 부적절한 경우만. 이유를 반드시 적는다(MONITORING_EXEMPT 답습).
 */
export const LABEL_EXEMPT = {
  manual: "테스트·수동 실행용 더미 값 — 실제 운영 잡이 아님",
  test: "테스트 픽스처 전용 값",
  x: "테스트 픽스처 전용 값",
};

async function* walkPy(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "tests" || e.name === "__pycache__" || e.name === ".venv") continue;
      yield* walkPy(p);
    } else if (e.name.endsWith(".py")) {
      yield p;
    }
  }
}

/**
 * backend 소스에서 실제 사용되는 job_type 집합을 추출.
 * 반환: { types: Set<string>, undeclared: Array<{file, prefix, varName}> }
 */
export async function extractBackendJobTypes(backendDir = BACKEND_DIR) {
  const types = new Set();
  const undeclared = [];

  for await (const file of walkPy(backendDir)) {
    const src = await readFile(file, "utf-8");

    for (const m of src.matchAll(LITERAL_RE)) types.add(m[1]);

    // 모듈 상수 경유 — 같은 파일 안의 선언만 따라간다.
    const consts = new Map();
    for (const d of src.matchAll(CONST_DECL_RE)) consts.set(d[1], d[2]);
    for (const m of src.matchAll(CONST_RE)) {
      const v = consts.get(m[1]);
      if (v) types.add(v);
    }

    // _record_job(db, <job_type>, ...) 위치 인자 — 리터럴 또는 상수
    for (const m of src.matchAll(RECORD_JOB_RE)) {
      if (m[1]) types.add(m[1]);
      else if (m[2]) {
        const v = consts.get(m[2]);
        if (v) types.add(v);
      }
    }

    // f-string 동적 조립 — 선언된 것만 전개, 아니면 undeclared 로 보고
    for (const m of src.matchAll(FSTRING_RE)) {
      const [, prefix, varName] = m;
      const suffixes = DYNAMIC_JOB_TYPES[prefix];
      if (suffixes) {
        for (const s of suffixes) types.add(`${prefix}${s}`);
      } else {
        undeclared.push({
          file: relative(".", file).replace(/\\/g, "/"),
          prefix,
          varName,
        });
      }
    }
  }
  return { types, undeclared };
}

/** crawl-job-labels.ts 의 사전 키 추출 (TS 를 import 하지 않고 텍스트 파싱) */
export async function extractLabelKeys(
  labelsPath = "src/lib/crawl-job-labels.ts",
) {
  const src = await readFile(labelsPath, "utf-8");
  const body = src.split("CRAWL_JOB_LABELS")[1] ?? "";
  // 대문자 포함(complex_detail_APT). 들여쓰기 2칸 = 사전 최상위 키만 — 내부의
  // label/desc(4칸)를 키로 오인하지 않는다.
  return new Set(
    [...body.matchAll(new RegExp(`^ {2}(${JOB_TYPE_CHARS}):\\s*\\{`, "gm"))].map((m) => m[1]),
  );
}

export async function scan(opts = {}) {
  const { types, undeclared } = await extractBackendJobTypes(
    opts.backendDir ?? BACKEND_DIR,
  );
  const labeled = await extractLabelKeys(opts.labelsPath);
  const exempt = new Set(Object.keys(opts.exempt ?? LABEL_EXEMPT));

  const missing = [...types].filter((t) => !labeled.has(t) && !exempt.has(t)).sort();
  const stale = [...labeled].filter((t) => !types.has(t)).sort();
  return { missing, stale, undeclared, total: types.size };
}

const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("check-job-labels.mjs");

if (isMain) {
  const { missing, stale, undeclared, total } = await scan();
  const problems = missing.length + undeclared.length;

  if (problems === 0) {
    console.log(`✅ job_type 이름표 정합 — backend ${total}종 전부 사전 등록됨`);
    if (stale.length > 0) {
      // 실패는 아님 — 옛 잡이 사라져도 사전에 남겨두는 건 무해(과거 이력 표시용).
      console.log(`   (참고: 최근 backend 소스에 없는 사전 항목 ${stale.length}종: ${stale.join(", ")})`);
    }
    process.exit(0);
  }

  if (missing.length > 0) {
    console.error(`🔴 사전에 한글 이름표가 없는 job_type ${missing.length}종:\n`);
    for (const m of missing) console.error(`  ${m}`);
    console.error(
      `\n이 코드들은 관리자 화면(크롤 작업 표·유형별 실패 분포·실시간 패널)에\n` +
        `영문 그대로 노출됩니다.\n` +
        `정정: frontend/src/lib/crawl-job-labels.ts 의 CRAWL_JOB_LABELS 에 추가.\n` +
        `  한글 이름은 backend/routers/admin/scheduler.py 의 SCHEDULER_JOB_META\n` +
        `  에 이미 공식 명칭이 있으므로 그 값을 그대로 쓸 것(화면·텔레그램 표기 통일).\n` +
        `  이름표가 부적절한 값이라면 이 스크립트의 LABEL_EXEMPT 에 이유와 함께 등록.`,
    );
  }

  if (undeclared.length > 0) {
    console.error(`\n🔴 전개 규칙이 선언되지 않은 동적 job_type ${undeclared.length}건:\n`);
    for (const u of undeclared) {
      console.error(`  ${u.file} — job_type=f"${u.prefix}{${u.varName}}"`);
    }
    console.error(
      `\nf-string 으로 조립되는 job_type 은 리터럴 검색에 안 잡혀 사전 누락을\n` +
        `조용히 만듭니다(세션 399 에 9종이 이렇게 누락됨).\n` +
        `정정: 이 스크립트의 DYNAMIC_JOB_TYPES 에 접두사 → 실제 조합 목록을 선언.`,
    );
  }
  process.exit(1);
}
