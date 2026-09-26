/**
 * 수집기 8종 정본(lib/admin/collectors.ts) 가드
 * 실행: npx vitest run src/lib/admin/__tests__/collectors.test.ts
 *
 * 1. 화면 버튼 집합 == BE 가 받는 수집기 집합(backend/routers/admin/collect.py `CollectorName`).
 *    BE 에 수집기가 늘었는데 버튼이 없거나, BE 에 없는 이름으로 버튼을 만들면 실패한다.
 *    BE 파일은 같은 레포 안에 항상 있으므로 못 읽으면 건너뛰지 않고 실패한다.
 * 2. 버튼 이름표·마지막 실행 연결이 실제로 있는 것을 가리킨다
 *    (job_type 은 crawl-job-labels 사전에, 잡 id 는 crawler/scheduler.py 에).
 * 3. 오래 걸리는 수집기는 확인 문장이 있다.
 * 4. 마지막 실행 한 줄(describeLastRun)의 상태별 문장.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { COLLECTORS, describeLastRun } from "../collectors";
import { CRAWL_JOB_LABELS } from "@/lib/crawl-job-labels";

// src/lib/admin/__tests__ → frontend → 레포 루트 → backend
const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(__dirname, "../../../../../backend");

/** collect.py 의 `CollectorName = Literal[ ... ]` 안의 "이름" 전부 (주석 줄은 건너뛴다) */
function backendCollectorNames(): string[] {
  const src = readFileSync(resolve(BACKEND, "routers/admin/collect.py"), "utf-8");
  const block = src.match(/^CollectorName\s*=\s*Literal\[([\s\S]*?)^\]/m);
  if (!block) throw new Error("collect.py 에서 CollectorName Literal 블록을 찾지 못했다");
  const body = block[1]
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  return [...body.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

describe("수집기 버튼 집합 = BE 수집기 집합", () => {
  it("BE 이름을 제대로 읽었다 (추출이 비면 아래 대조가 헛돈다)", () => {
    expect(backendCollectorNames().length).toBeGreaterThanOrEqual(8);
  });

  it("버튼 8종과 BE 가 받는 이름이 정확히 같다 (빠진 것도 남는 것도 없다)", () => {
    const fe = COLLECTORS.map((c) => c.name).sort();
    expect(fe).toEqual([...new Set(fe)]); // 중복 없음
    expect(fe).toEqual(backendCollectorNames().sort());
  });

  it("jobType 짝이 BE collect.py `_COLLECTOR_JOB_TYPE` 와 짝 단위로 같다 (BE 가 이 값으로 중복 실행을 막는다)", () => {
    // BE 쪽에도 같은 대조가 있지만(test_admin_collect_background.py) CI 경로 필터로 FE 만 바뀐 PR 에선 BE 시험이
    // 안 돌 수 있어 양쪽에 둔다
    const src = readFileSync(resolve(BACKEND, "routers/admin/collect.py"), "utf-8");
    const block = src.match(/^_COLLECTOR_JOB_TYPE[^{]*\{([\s\S]*?)^\}/m);
    if (!block) throw new Error("collect.py 에서 _COLLECTOR_JOB_TYPE 표를 찾지 못했다");
    const be = Object.fromEntries([...block[1].matchAll(/"([a-z-]+)":\s*"([a-z_]+)"/g)].map((m) => [m[1], m[2]]));
    expect(Object.keys(be)).toHaveLength(8);
    expect(Object.fromEntries(COLLECTORS.map((c) => [c.name, c.jobType]))).toEqual(be);
  });

  it("버튼 이름표(job_type)는 crawl-job-labels 사전에, 마지막 실행 잡 id 는 crawler/scheduler.py 에 있다", () => {
    const scheduler = readFileSync(resolve(BACKEND, "crawler/scheduler.py"), "utf-8");
    for (const c of COLLECTORS) {
      expect(CRAWL_JOB_LABELS[c.jobType], c.jobType).toBeDefined();
      expect(scheduler.includes(`"scheduler_job_id": "${c.schedulerJobId}"`) || scheduler.includes(`id="${c.schedulerJobId}"`), c.schedulerJobId).toBe(true);
    }
  });

  it("오래 걸리는 수집기(관리비 2종·옛 시세·어린이집)는 누르기 전 확인 문장이 있다", () => {
    const long = COLLECTORS.filter((c) => c.long).map((c) => c.name).sort();
    expect(long).toEqual(["backfill-price", "childcare", "kapt-costs", "kapt-match"]);
    for (const c of COLLECTORS.filter((x) => x.long)) {
      expect(c.confirm, c.name).toMatch(/걸리고 .*회를? 써요.*계속할까요\?$/);
    }
  });
});

describe("describeLastRun — 마지막 실행 한 줄", () => {
  const now = new Date("2026-09-26T07:00:00+09:00");
  const base = { total_items: 0, processed_items: 0 };

  it("기록이 없으면 '기록 없음', 수동 실행이 안 잡히는 수집기는 '자동 실행' 이라고 밝힌다", () => {
    expect(describeLastRun(null, true, now)).toEqual({ text: "마지막 실행: 기록 없음", tone: "none", running: false });
    expect(describeLastRun(null, false, now).text).toBe("마지막 자동 실행: 기록 없음");
  });

  it("실패 = 끝난 시각 기준 'N분 전 실패 — 우리말 사유', 원문은 raw 로 따로", () => {
    const r = describeLastRun(
      { ...base, status: "failed", started_at: "2026-09-26T06:20:00+09:00", completed_at: "2026-09-26T06:34:00+09:00", error_message: "raw", error_plain: "포털 오류 04" },
      true,
      now,
    );
    expect(r).toEqual({ text: "마지막 실행: 26분 전 실패 — 포털 오류 04", tone: "fail", running: false, raw: "raw" });
  });

  it("실패인데 우리말 번역이 없으면 원문 대신 목록을 가리킨다", () => {
    const r = describeLastRun({ ...base, status: "failed", completed_at: "2026-09-26T06:00:00+09:00", error_message: "psycopg2.OperationalError" }, true, now);
    expect(r.text).toBe("마지막 실행: 1시간 전 실패 — 사유는 아래 '수집 작업 목록'에서 보세요");
    expect(r.text).not.toContain("psycopg2");
  });

  it("완료 = 처리/전체 건수 (0/0 이면 건수 생략)", () => {
    expect(describeLastRun({ status: "completed", completed_at: "2026-09-26T04:30:00+09:00", total_items: 1200, processed_items: 1200 }, true, now).text)
      .toBe("마지막 실행: 2시간 전 · 완료 (1,200/1,200건)");
    expect(describeLastRun({ ...base, status: "completed", completed_at: "2026-09-26T04:30:00+09:00" }, true, now).text)
      .toBe("마지막 실행: 2시간 전 · 완료");
  });

  it("도는 중·대기 = running true (버튼 잠금)", () => {
    for (const status of ["running", "pending"]) {
      const r = describeLastRun({ ...base, status, started_at: "2026-09-26T06:50:00+09:00" }, true, now);
      expect(r).toEqual({ text: "지금 도는 중 (10분 전 시작)", tone: "running", running: true });
    }
    expect(describeLastRun({ ...base, status: "cancelled", completed_at: "2026-09-26T06:50:00+09:00" }, true, now).running).toBe(false);
  });
});
