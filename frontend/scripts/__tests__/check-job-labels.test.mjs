/**
 * check-job-labels.mjs 단위 테스트 (세션 399)
 * 실행: npx vitest run scripts/__tests__/check-job-labels.test.mjs
 *
 * 핵심 회귀 가드 = "리터럴 grep 이 못 보는 형태"를 실제로 잡는가:
 *   (1) job_type=f"complex_detail_{rtype}" 동적 조립
 *   (2) job_type=_MODULE_CONST 상수 경유
 * 세션 399 에 사전 누락 15종 중 9종이 정확히 이 두 형태였다.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan, extractBackendJobTypes, extractLabelKeys } from "../check-job-labels.mjs";

// 워커별 고유 임시 디렉터리 — check-mdx-jsx.test.mjs 답습(세션 195 EPERM 경합).
let FIXTURE;

/** 임시 backend/ + labels.ts 한 쌍을 만든다 */
async function makeFixture({ py, labels }) {
  const backend = join(FIXTURE, "backend");
  await mkdir(join(backend, "crawler"), { recursive: true });
  for (const [name, content] of Object.entries(py)) {
    await writeFile(join(backend, "crawler", name), content, "utf-8");
  }
  const labelsPath = join(FIXTURE, "labels.ts");
  await writeFile(labelsPath, labels, "utf-8");
  return { backendDir: backend, labelsPath };
}

const LABELS_WITH = (...keys) =>
  `export const CRAWL_JOB_LABELS: Record<string, X> = {\n` +
  keys.map((k) => `  ${k}: {\n    label: "라벨",\n    desc: "설명",\n  },`).join("\n") +
  `\n};\n`;

describe("check-job-labels", () => {
  beforeEach(async () => {
    FIXTURE = await mkdtemp(join(tmpdir(), "joblabels-"));
  });
  afterEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  it("리터럴 job_type 이 사전에 있으면 통과", async () => {
    const f = await makeFixture({
      py: { "a.py": 'job = CrawlJob(job_type="air_quality", status="running")' },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    expect(r.missing).toEqual([]);
    expect(r.undeclared).toEqual([]);
  });

  it("리터럴 job_type 이 사전에 없으면 missing 으로 검출", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type="billing_charge")' },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    expect(r.missing).toContain("billing_charge");
  });

  /** 세션 399 핵심 — 인계 블록의 6종 목록이 이 형태를 통째로 놓쳤다 */
  it("f-string 동적 job_type 을 선언된 목록으로 전개해 검출한다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type=f"complex_detail_{real_estate_type}")' },
      labels: LABELS_WITH("complex_detail_APT"),
    });
    const r = await scan(f);
    // APT 만 등록됐으므로 나머지 4종이 빠진 것으로 잡혀야 한다
    expect(r.missing).toEqual([
      "complex_detail_ABYG",
      "complex_detail_JGC",
      "complex_detail_OBYG",
      "complex_detail_OPST",
    ]);
  });

  /** 세션 399 핵심 — service_kapt.py 가 이 형태라 리터럴 grep 에 안 잡혔다 */
  it("모듈 상수 경유 job_type 을 따라가 검출한다", async () => {
    const f = await makeFixture({
      py: {
        "a.py": [
          '_MATCH_JOB_TYPE = "kapt_match"',
          '_COST_JOB_TYPE = "kapt_costs"',
          "job = _record_job(db, _MATCH_JOB_TYPE, sid)",
          "job2 = CrawlJob(job_type=_COST_JOB_TYPE)",
        ].join("\n"),
      },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    // CrawlJob(job_type=_COST_JOB_TYPE) 형태가 상수를 거쳐 해석돼야 한다
    expect(r.missing).toContain("kapt_costs");
  });

  /** 선언 안 된 새 f-string 이 조용히 새지 않는지 — 가드의 가드 */
  it("전개 규칙이 없는 새 f-string 은 undeclared 로 실패시킨다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type=f"brand_new_{kind}")' },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    expect(r.undeclared).toHaveLength(1);
    expect(r.undeclared[0].prefix).toBe("brand_new_");
    expect(r.undeclared[0].varName).toBe("kind");
  });

  /**
   * 세션 399 핵심 — _record_job(db, "x", sid) 위치 인자 형태.
   * 호출부에 `job_type=` 글자가 없어서 다른 패턴이 전부 못 본다.
   * official_price · api_version_probe 가 이 경로라 최초 구현에서 누락됐다
   * (사람이 센 15 vs 스크립트가 센 11 의 차이가 정확히 이 4종이었다).
   */
  it("_record_job 위치 인자의 리터럴 job_type 을 검출한다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'job = _record_job(db, "official_price", scheduler_job_id)' },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    expect(r.missing).toContain("official_price");
  });

  it("_record_job 위치 인자가 상수면 선언을 따라가 검출한다", async () => {
    const f = await makeFixture({
      py: {
        "a.py": ['_MATCH_JOB_TYPE = "kapt_match"', "job = _record_job(db, _MATCH_JOB_TYPE, sid)"].join("\n"),
      },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan(f);
    expect(r.missing).toContain("kapt_match");
  });

  /** 대문자 포함 job_type — [a-z_]+ 패턴이면 5종을 통째로 놓친다 */
  it("대문자가 섞인 job_type 도 사전 키로 정상 인식한다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type=f"complex_detail_{rtype}")' },
      labels: LABELS_WITH(
        "complex_detail_APT",
        "complex_detail_OPST",
        "complex_detail_JGC",
        "complex_detail_ABYG",
        "complex_detail_OBYG",
      ),
    });
    const r = await scan(f);
    expect(r.missing).toEqual([]);
  });

  it("LABEL_EXEMPT 에 등록된 값은 missing 에서 제외된다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type="manual")' },
      labels: LABELS_WITH("air_quality"),
    });
    const r = await scan({ ...f, exempt: { manual: "더미" } });
    expect(r.missing).toEqual([]);
  });

  it("tests/ 디렉터리는 스캔 대상에서 제외된다", async () => {
    const backend = join(FIXTURE, "backend");
    await mkdir(join(backend, "tests"), { recursive: true });
    await mkdir(join(backend, "crawler"), { recursive: true });
    await writeFile(join(backend, "crawler", "a.py"), 'CrawlJob(job_type="air_quality")', "utf-8");
    await writeFile(join(backend, "tests", "t.py"), 'CrawlJob(job_type="fixture_only")', "utf-8");
    const labelsPath = join(FIXTURE, "labels.ts");
    await writeFile(labelsPath, LABELS_WITH("air_quality"), "utf-8");

    const r = await scan({ backendDir: backend, labelsPath });
    expect(r.missing).toEqual([]);
  });

  it("사전에만 있고 backend 에 없는 항목은 stale 로 보고하되 실패시키지 않는다", async () => {
    const f = await makeFixture({
      py: { "a.py": 'CrawlJob(job_type="air_quality")' },
      labels: LABELS_WITH("air_quality", "long_gone_job"),
    });
    const r = await scan(f);
    expect(r.missing).toEqual([]);
    expect(r.stale).toEqual(["long_gone_job"]);
  });

  it("extractLabelKeys 는 중첩 객체의 내부 키를 사전 키로 오인하지 않는다", async () => {
    const labelsPath = join(FIXTURE, "labels.ts");
    await writeFile(labelsPath, LABELS_WITH("air_quality", "childcare"), "utf-8");
    const keys = await extractLabelKeys(labelsPath);
    expect([...keys].sort()).toEqual(["air_quality", "childcare"]);
  });

  it("실제 backend 를 스캔하면 job_type 을 여러 종 찾아낸다 (파서 살아있음 확인)", async () => {
    const { types } = await extractBackendJobTypes("../backend");
    expect(types.size).toBeGreaterThan(10);
    expect(types.has("complex_articles")).toBe(true);
    // f-string 전개가 실제 소스에서도 동작하는지
    expect(types.has("complex_detail_JGC")).toBe(true);
  });
});
