// @ts-check
/**
 * notify-sister.mjs 단위 테스트 (세션 459 — 미분양 scripts/notify-sister.test.mjs 를 2u 값으로)
 * 실행: npx vitest run scripts/__tests__/notify-sister.test.mjs
 *
 * 통보 대상 3(등록 파일 변경 · 공유 표 마이그 · 강제) · 제외 3(2u 전용 표 파일 · 주석만 diff · Dependabot)
 * + stale 고르기 · base 고르기 · 정본 없음 exit 1 · 본체(가짜 git·gh).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORCED_REASON,
  buildIssue,
  decideNotice,
  loadRegistry,
  pickBase,
  pickStale,
  runNotify,
  substantiveLines,
  tablesTheyCareAbout,
  tablesWrittenTogether,
} from "../notify-sister.mjs";

// jsdom 환경에선 new URL(상대, import.meta.url) 이 file: 이 아니다 → admin-mobile-guard.test.mjs 와 같은 꼴
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "notify-sister.mjs");

/** 정본 모양을 줄인 시험용 정본 */
function makeRegistry() {
  return {
    version: 1,
    tables: {
      complexes: { owner: "shared", readers: ["2u", "mibunyang"], columns: { "2u": ["cortar_no"] } },
      articles: { owner: "shared", readers: ["2u", "mibunyang"] },
      apartments: { owner: "mibunyang", readers: ["2u"] },
      kapt_complex_map: { owner: "2u", readers: ["mibunyang"] },
      user_profiles: { owner: "2u" },
      article_price_history: { owner: "2u" },
    },
    views: { apartments_flat: { owner: "mibunyang" } },
    writers: {
      "2u": {
        "backend/services/upsert.py": { article_price_history: ["*"], articles: [], complexes: ["complex_no", "complex_name"] },
        "backend/routers/users.py": { user_profiles: ["*"] },
      },
    },
  };
}

const CODE_DIFF = [
  "diff --git a/backend/services/upsert.py b/backend/services/upsert.py",
  "--- a/backend/services/upsert.py",
  "+++ b/backend/services/upsert.py",
  "@@ -1,3 +1,3 @@",
  '-    stmt = insert(Complex).values(rows)',
  '+    stmt = insert(Complex).values(rows).returning(Complex.complex_no)',
].join("\n");

const COMMENT_DIFF = [
  "--- a/backend/services/upsert.py",
  "+++ b/backend/services/upsert.py",
  "@@ -1,3 +1,5 @@",
  "-# 옛 설명",
  "+# 새 설명",
  "+",
  "+    # 들여쓴 주석",
].join("\n");

/** @param {Partial<Parameters<typeof decideNotice>[0]>} over */
function decide(over) {
  return decideNotice({
    registry: makeRegistry(),
    changed: [],
    diffOf: () => "",
    readFile: () => "",
    commitTitle: "feat: 무언가",
    author: "developer-duno <x@example.com>",
    ...over,
  });
}

describe("통보 대상 3", () => {
  it("① 공유 표를 쓰는 등록 파일(upsert.py)의 코드 한 줄 변경 → 통보 (2u 전용 표 이름은 사유에 안 나온다)", () => {
    const d = decide({ changed: [{ path: "backend/services/upsert.py", status: "M" }], diffOf: () => CODE_DIFF });
    expect(d.notify).toBe(true);
    expect(d.reasons).toHaveLength(1);
    expect(d.reasons[0]).toContain("backend/services/upsert.py");
    expect(d.reasons[0]).toContain("변경(2줄) — 표: articles, complexes(2칸)");
    expect(d.reasons[0]).not.toContain("article_price_history");
  });

  it("② 공유 표(complexes)를 건드린 새 마이그 → 통보 + 이슈 본문에 DB 반영 시각 칸", () => {
    const d = decide({
      changed: [{ path: "backend/db/migrations/V072__x.sql", status: "A" }],
      readFile: () => "ALTER TABLE complexes ADD COLUMN foo text;",
    });
    expect(d.notify).toBe(true);
    expect(d.reasons[0]).toBe("새 마이그 `backend/db/migrations/V072__x.sql` — 표: complexes");
    const issue = buildIssue({ reasons: d.reasons, commitTitle: "feat(db): V072", commitUrl: "u", sha: "abcdef1234" });
    expect(issue.title).toBe("[→미분양] feat(db): V072");
    expect(issue.body).toContain("**DB 반영 시각**: (적용한 사람이 채움)");
  });

  it("③ force 면 사유가 없어도 실증용 강제 통보 1건 (사유가 있으면 원래 사유 그대로)", () => {
    const d = decide({ changed: [{ path: "frontend/src/app/page.tsx", status: "M" }], force: true });
    expect(d).toEqual({ notify: true, reasons: [FORCED_REASON] });
    const d2 = decide({ changed: [{ path: "backend/services/upsert.py", status: "M" }], diffOf: () => CODE_DIFF, force: true });
    expect(d2.reasons[0]).toContain("upsert.py");
    expect(buildIssue({ reasons: d.reasons, commitTitle: "t", commitUrl: "u", sha: "abcdef12" }).body).not.toContain("DB 반영 시각");
  });

  it("미분양이 읽는 2u 표(readers) · 미분양 VIEW 를 건드린 마이그도 통보", () => {
    const d = decide({
      changed: [{ path: "backend/db/migrations/V073__y.sql", status: "A" }],
      readFile: () => "CREATE INDEX ix ON kapt_complex_map (kapt_code); -- apartments_flat 은 주석\nSELECT * FROM apartments_flat;",
    });
    expect(d.reasons[0]).toContain("표: apartments_flat, kapt_complex_map");
  });
});

describe("제외 3", () => {
  it("④ 2u 전용 표(user_profiles)만 쓰는 등록 파일 변경 → 통보 안 함", () => {
    const d = decide({ changed: [{ path: "backend/routers/users.py", status: "M" }], diffOf: () => CODE_DIFF });
    expect(d.notify).toBe(false);
  });

  it("⑤ 등록 파일이어도 주석(#)·빈 줄만 바뀌면 통보 안 함", () => {
    const d = decide({ changed: [{ path: "backend/services/upsert.py", status: "M" }], diffOf: () => COMMENT_DIFF });
    expect(d.notify).toBe(false);
    expect(substantiveLines(COMMENT_DIFF)).toEqual([]);
  });

  it("⑥ Dependabot → 공유 표 마이그여도 통보 안 함", () => {
    const d = decide({
      author: "dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>",
      changed: [{ path: "backend/db/migrations/V072__x.sql", status: "A" }],
      readFile: () => "ALTER TABLE complexes ADD COLUMN foo text;",
    });
    expect(d.notify).toBe(false);
    expect(d.skipped).toBe("Dependabot");
  });

  it("범위 안 커밋 중 하나라도 사람이면 Dependabot 이 섞여 있어도 판정한다(git log <base>..HEAD 작성자 전부)", () => {
    const d = decide({
      authors: ["dependabot[bot]", "developer-duno"],
      changed: [{ path: "backend/db/migrations/V072__x.sql", status: "A" }],
      readFile: () => "ALTER TABLE complexes ADD COLUMN foo text;",
    });
    expect(d.notify).toBe(true);
    expect(decide({ authors: ["dependabot[bot]", "dependabot[bot]"], changed: [] }).skipped).toBe("Dependabot");
  });

  it("2u 전용 표 마이그 · 주석 안에만 표 이름 · 기존 마이그 수정(M) → 통보 안 함", () => {
    const d = decide({
      changed: [
        { path: "backend/db/migrations/V074__z.sql", status: "A" },
        { path: "backend/db/migrations/V075__w.sql", status: "A" },
        { path: "backend/db/migrations/V070__old.sql", status: "M" },
      ],
      readFile: (p) =>
        p.includes("V074") ? "ALTER TABLE user_profiles ADD COLUMN memo text;" : "/* complexes 와 무관 */ ALTER TABLE user_profiles DROP COLUMN memo; -- articles",
    });
    expect(d.notify).toBe(false);
  });

  it("줄 머리 블록 주석이 그 줄에서 닫히고 뒤에 코드가 있으면 실질 줄 · 안 닫히면 주석", () => {
    expect(substantiveLines("+/* a */ const x = 1;")).toEqual(["const x = 1;"]);
    expect(substantiveLines("+/* a")).toEqual([]);
    expect(substantiveLines("+ * 설명 */")).toEqual([]);
  });
});

describe("주석 판정은 확장자별", () => {
  it(".py 는 # 만 주석 — `**kwargs,`·`*rest, last = rows` 줄은 실질 변경이라 통보", () => {
    const pyDiff = ["@@ -1,1 +1,3 @@", "+    **save_guard.job_note(),", "+    *rest, last = rows"].join("\n");
    const d = decide({ changed: [{ path: "backend/services/upsert.py", status: "M" }], diffOf: () => pyDiff });
    expect(d.notify).toBe(true);
    expect(d.reasons[0]).toContain("변경(2줄)");
  });

  it(".sql 은 -- 만 주석 — 등록된 .sql 파일에 -- 주석만 바뀌면 통보 안 함", () => {
    const base = makeRegistry();
    const registry = { ...base, writers: { "2u": { ...base.writers["2u"], "backend/scripts/fix_complexes.sql": { complexes: [] } } } };
    const sqlDiff = ["@@ -1,1 +1,2 @@", "-  -- 옛 설명", "+  -- 새 설명", "+"].join("\n");
    const d = decide({ registry, changed: [{ path: "backend/scripts/fix_complexes.sql", status: "M" }], diffOf: () => sqlDiff });
    expect(d.notify).toBe(false);
    expect(substantiveLines("+# 해시는 SQL 주석이 아님", "a.sql")).toEqual(["# 해시는 SQL 주석이 아님"]);
  });
});

describe("표 고르기", () => {
  it("tablesTheyCareAbout(마이그 판정) = 공유·미분양 소유·미분양이 읽는 표 + 같은 조건의 VIEW", () => {
    expect([...tablesTheyCareAbout(makeRegistry())].sort()).toEqual(["apartments", "apartments_flat", "articles", "complexes", "kapt_complex_map"]);
  });

  it("tablesWrittenTogether(등록 파일 판정) = 공유·미분양 소유 표만", () => {
    expect([...tablesWrittenTogether(makeRegistry())].sort()).toEqual(["apartments", "articles", "complexes"]);
  });
});

describe("정본 읽기 — 없으면 조용히 통과하지 않는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "notify-test-"));
  const good = join(dir, "good.json");
  const bad = join(dir, "bad.json");
  writeFileSync(good, JSON.stringify(makeRegistry()));
  writeFileSync(bad, JSON.stringify({ version: 1, tables: {}, writers: { mibunyang: {} } }));

  it("loadRegistry — 경로 없음·파일 없음·writers.2u 없음은 null, 정상은 정본", () => {
    expect(loadRegistry(undefined)).toBeNull();
    expect(loadRegistry(join(dir, "none.json"))).toBeNull();
    expect(loadRegistry(bad)).toBeNull();
    expect(loadRegistry(good)?.writers["2u"]).toBeDefined();
  });

  it("CLI — OWNERSHIP_REGISTRY_PATH 가 없으면 '정본 없음' 으로 exit 1", () => {
    const env = { ...process.env };
    delete env.OWNERSHIP_REGISTRY_PATH;
    const r = spawnSync(process.execPath, [SCRIPT, "--dry-run"], { env, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("정본 없음");
  });
});

describe("본체 runNotify(가짜 git·gh)", () => {
  const now = new Date("2026-10-30T00:00:00Z");

  /** @param {Record<string,string>} answers @param {string[][]} [gitCalls] */
  function fakeGit(answers, gitCalls = []) {
    return (/** @type {string[]} */ args) => {
      gitCalls.push(args);
      const k = args.join(" ");
      if (k.startsWith("diff --name-status")) return answers.nameStatus;
      if (k === "log -1 --format=%s") return answers.title;
      if (/^log --format=%an \S+\.\.HEAD$/.test(k)) return answers.authors ?? "developer-duno\n";
      if (k === "rev-parse HEAD") return "abcdef1234567890";
      if (/^diff \S+ HEAD --/.test(k)) return answers.diff ?? "";
      throw new Error(`예상 못 한 git ${k}`);
    };
  }

  /** @param {string[][]} calls @param {object[]} [openIssues] */
  function fakeGh(calls, openIssues = []) {
    return (/** @type {string[]} */ args) => {
      calls.push(args);
      return args[0] === "issue" && args[1] === "list" ? JSON.stringify(openIssues) : "";
    };
  }

  it("통보 대상이면 라벨 만들고 이슈 1건 + 14일 지난 열린 이슈는 stale-unread 붙여 닫는다", () => {
    /** @type {string[][]} */
    const calls = [];
    const r = runNotify({
      git: fakeGit({ nameStatus: "M\tbackend/services/upsert.py\n", title: "fix(be): upsert 고침", diff: CODE_DIFF }),
      gh: fakeGh(calls, [
        { number: 3, createdAt: "2026-10-01T00:00:00Z" },
        { number: 9, createdAt: "2026-10-25T00:00:00Z" },
      ]),
      registry: makeRegistry(),
      readFile: () => "",
      commitUrl: "https://github.com/developer-duno/naver-estate-web/commit/abc",
      now,
      log: () => {},
    });
    expect(r.created).toBe(true);
    expect(r.closed).toEqual([3]);
    expect(calls.filter((c) => c[0] === "issue" && c[1] === "create")).toEqual([
      ["issue", "create", "--label", "cross-repo-notice", "--title", "[→미분양] fix(be): upsert 고침", "--body-file", expect.stringMatching(/body\.md$/)],
    ]);
    expect(calls.find((c) => c[0] === "issue" && c[1] === "list")).toEqual([
      "issue", "list", "--label", "cross-repo-notice", "--state", "open", "--json", "number,createdAt", "--limit", "100",
    ]);
    expect(calls.filter((c) => c[0] === "issue" && c[1] === "edit")).toEqual([["issue", "edit", "3", "--add-label", "stale-unread"]]);
    expect(calls.filter((c) => c[0] === "issue" && c[1] === "close")).toEqual([
      ["issue", "close", "3", "--reason", "not planned", "--comment", "읽지 않은 채 닫힘 — 열린 지 14일이 지나 자동으로 닫았습니다(notify-sister)."],
    ]);
    expect(calls.filter((c) => c[0] === "label")).toEqual([
      ["label", "create", "cross-repo-notice", "--color", "0E8A16", "--description", "미분양에 보내는 공유 DB 통보(닫음 = 읽음)", "--force"],
      ["label", "create", "stale-unread", "--color", "BFBFBF", "--description", "14일 동안 안 읽힌 채 자동으로 닫힌 통보", "--force"],
    ]);
  });

  it("통보 사유가 없으면 이슈를 안 만들고(14일 정리는 돈다), force 면 1건 만든다", () => {
    /** @type {string[][]} */
    const calls = [];
    const base = { git: fakeGit({ nameStatus: "M\tfrontend/src/app/page.tsx\n", title: "feat(fe): 화면" }), gh: fakeGh(calls), registry: makeRegistry(), readFile: () => "", commitUrl: "x", now, log: () => {} };
    expect(runNotify(base).created).toBe(false);
    expect(calls.some((c) => c[1] === "create")).toBe(false);
    expect(calls.some((c) => c[1] === "list")).toBe(true);
    expect(runNotify({ ...base, force: true }).created).toBe(true);
    expect(calls.filter((c) => c[0] === "issue" && c[1] === "create")).toHaveLength(1);
  });

  it("push 의 before 가 오면 그것과 비교한다 · pickBase 는 0 만 40자·없는 커밋·없음이면 HEAD~1", () => {
    /** @type {string[][]} */
    const gitCalls = [];
    const before = "a".repeat(40);
    runNotify({
      git: fakeGit({ nameStatus: "M\tbackend/services/upsert.py\n", title: "feat: x", diff: CODE_DIFF }, gitCalls),
      gh: fakeGh([]),
      registry: makeRegistry(),
      readFile: () => "",
      commitUrl: "x",
      now,
      base: before,
      dryRun: true,
      log: () => {},
    });
    expect(gitCalls.filter((c) => c[0] === "diff")).toEqual([
      ["diff", "--name-status", before, "HEAD"],
      ["diff", before, "HEAD", "--", "backend/services/upsert.py"],
    ]);
    // Dependabot 판정용 작성자는 비교 범위 전체에서 읽는다
    expect(gitCalls).toContainEqual(["log", "--format=%an", `${before}..HEAD`]);
    expect(pickBase(before, () => true)).toBe(before);
    expect(pickBase("0".repeat(40), () => true)).toBe("HEAD~1");
    expect(pickBase(before, () => false)).toBe("HEAD~1");
    expect(pickBase(undefined, () => true)).toBe("HEAD~1");
  });

  it("pickStale — 정확히 14일 경계", () => {
    expect(pickStale([{ number: 1, createdAt: "2026-10-16T00:00:00Z" }, { number: 2, createdAt: "2026-10-15T23:59:59Z" }], now)).toEqual([2]);
  });
});
