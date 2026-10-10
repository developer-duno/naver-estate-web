// @ts-check
/**
 * 공유 DB 를 건드린 main 커밋을 미분양(mibunyang)에 자동 통보 (세션 459 · 미분양 scripts/notify-sister.mjs 를 2u 값으로 옮김)
 *
 * ## 왜
 *
 * 같은 Supabase DB 를 미분양과 같이 쓴다. 공유 표·미분양이 읽는 표를 바꾼 커밋을 사람이 쪽지로 알렸는데,
 * 빠뜨리면 미분양은 화면이 깨진 뒤에야 안다. 그래서 합친 뒤 **이 레포에 라벨 이슈**(`cross-repo-notice`)를
 * 하나 열고, 미분양 세션 시작 훅이 그 이슈를 읽는다. **닫음 = 읽음.** 14일 넘게 안 닫힌 이슈는
 * `stale-unread` 라벨을 붙여 닫는다(쌓임 방지 — 닫힘 댓글에 "읽지 않은 채 닫힘").
 *
 * ⚠ 사후 기록이다 — 마이그는 대개 합치기 **전에** 대시보드에서 먼저 적용된다. DDL 을 적용하기 **전**의
 * 상대 통보는 지금처럼 사람 쪽지로 한다. 이 장치는 "빠뜨린 통보"를 잡는 그물이다.
 *
 * ## 정본
 *
 * 표·칸 소유 정본은 미분양 레포의 `supabase/ownership.json` 이다. 워크플로가 raw 주소로 받아 둔 파일 경로를
 * 환경변수 `OWNERSHIP_REGISTRY_PATH` 로 넘긴다. 없거나 못 읽으면 exit 1(조용히 "통보 없음"으로 지나가지 않는다).
 *
 * ## 통보 대상
 *
 * - `backend/db/migrations/` 새 `.sql` 중 미분양이 읽거나 같이 쓰는 표·VIEW 이름이 든 것
 *   (owner 가 shared·mibunyang 이거나 readers 에 mibunyang)
 * - 정본 `writers.2u` 에 등록된 파일 중 shared·mibunyang 소유 표를 쓰는 파일의 변경 —
 *   단 바뀐 줄이 전부 주석·빈 줄이면 제외(`git diff -w` 는 주석을 못 거른다). 주석은 확장자별로 본다 —
 *   `.py` = `#` · `.sql` = `--` · `.js/.mjs/.ts/.tsx` = `//`·`/*`·`*`·`*\/` · 그 외 = 전부
 * - 제외: 비교 범위 안 커밋이 전부 Dependabot(사람 커밋이 하나라도 섞이면 판정)
 * - `NOTIFY_FORCE=1`(수동 실행 force) 이면 사유가 없어도 "실증용 강제 통보" 1건
 *
 * 실행: .github/workflows/notify-sister.yml 이 main push 마다(GH_TOKEN 필요). 로컬 미리보기 = `--dry-run`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// frontend/scripts/notify-sister.mjs → 레포 루트
const REPO_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))).replace(/\\/g, "/");
export const LABEL = "cross-repo-notice";
export const STALE_LABEL = "stale-unread";
export const STALE_DAYS = 14;
const MIGRATIONS_DIR = "backend/db/migrations/";
const MIGRATION_REASON = "새 마이그";
export const FORCED_REASON = "실증용 강제 통보 — 수동 실행(force)으로 만든 이슈입니다. 공유 DB 변경이 아닐 수 있습니다.";

/**
 * 미분양이 신경 쓰는 표·VIEW — 공유 표, 미분양 소유 표, 미분양이 읽는 표·VIEW.
 * @param {any} registry
 * @returns {Set<string>}
 */
export function tablesTheyCareAbout(registry) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const group of [registry?.tables, registry?.views]) {
    for (const [name, t] of Object.entries(group ?? {})) {
      if (t?.owner === "shared" || t?.owner === "mibunyang" || (t?.readers ?? []).includes("mibunyang")) out.add(name);
    }
  }
  return out;
}

/**
 * 등록 파일 변경 통보용 — 미분양과 같이 쓰거나(shared) 미분양이 주인인 표만.
 * 2u 전용 표(user_profiles·payments 등)를 쓰는 파일의 변경은 미분양과 무관하다.
 * @param {any} registry
 * @returns {Set<string>}
 */
export function tablesWrittenTogether(registry) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const [name, t] of Object.entries(registry?.tables ?? {})) {
    if (t?.owner === "shared" || t?.owner === "mibunyang") out.add(name);
  }
  return out;
}

/**
 * 확장자별 주석 규칙 — 파이썬 `**kwargs,`·`*rest, last = rows` 줄을 블록 주석으로 오인하지 않게.
 * `block` = 줄 머리 `/*`·`*`·`*\/` 를 블록 주석으로 볼지.
 * @param {string} filePath
 */
function commentRule(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return { block: false, line: /^#/ };
  if (ext === ".sql") return { block: false, line: /^--/ };
  if ([".js", ".mjs", ".ts", ".tsx"].includes(ext)) return { block: true, line: /^\/\// };
  return { block: true, line: /^(\/\/|#|--)/ };
}

/**
 * diff 에서 바뀐 줄(+/-) 중 주석·빈 줄이 아닌 것.
 * @param {string} diffText `git diff` 한 파일분
 * @param {string} [filePath] 주석 규칙을 고르는 파일 경로(없으면 `//`·`#`·`--`·블록 주석 전부)
 */
export function substantiveLines(diffText, filePath = "") {
  const rule = commentRule(filePath);
  return diffText
    .split(/\r?\n/)
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .map((l) => l.slice(1).trim())
    // 줄 머리 블록 주석이 그 줄에서 닫히고 뒤에 코드가 있으면(`/* a */ const x = 1;`) 뒤 코드는 실질 줄
    .map((l) => {
      if (!rule.block || (!l.startsWith("/*") && !l.startsWith("*"))) return l;
      const close = l.indexOf("*/", l.startsWith("/*") ? 2 : 0);
      return close >= 0 ? l.slice(close + 2).trim() : "";
    })
    .filter((l) => l !== "" && !rule.line.test(l));
}

/**
 * @typedef {{ path: string, status: string }} ChangedFile  status = git --name-status 첫 글자(A/M/D/R…)
 * @typedef {{ notify: boolean, skipped?: string, reasons: string[] }} Decision
 */

/**
 * 통보할지 판정. `authors` = 비교 범위 안 모든 커밋의 작성자(없으면 `author` 하나).
 * @param {{ registry: any, changed: ChangedFile[], diffOf: (p: string) => string, readFile: (p: string) => string, commitTitle: string, author?: string, authors?: string[], force?: boolean }} input
 * @returns {Decision}
 */
export function decideNotice({ registry, changed, diffOf, readFile, author = "", authors, force = false }) {
  const decision = judge({ registry, changed, diffOf, readFile, authors: authors?.length ? authors : [author] });
  if (!decision.notify && force) return { notify: true, reasons: [FORCED_REASON] };
  return decision;
}

/**
 * @param {{ registry: any, changed: ChangedFile[], diffOf: (p: string) => string, readFile: (p: string) => string, authors: string[] }} input
 * @returns {Decision}
 */
function judge({ registry, changed, diffOf, readFile, authors }) {
  // 범위 안 커밋이 **전부** Dependabot 일 때만 건너뛴다 — 사람 커밋이 하나라도 섞이면 판정한다
  if (authors.every((a) => /dependabot/i.test(a))) return { notify: false, skipped: "Dependabot", reasons: [] };

  const care = tablesTheyCareAbout(registry);
  const together = tablesWrittenTogether(registry);
  const mine = registry?.writers?.["2u"] ?? {};
  /** @type {string[]} */
  const reasons = [];

  for (const f of changed) {
    if (f.path.startsWith(MIGRATIONS_DIR) && f.path.endsWith(".sql") && f.status.startsWith("A")) {
      const sql = readFile(f.path).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
      const hit = [...care].filter((t) => new RegExp(`\\b${t}\\b`, "i").test(sql)).sort();
      if (hit.length) reasons.push(`${MIGRATION_REASON} \`${f.path}\` — 표: ${hit.join(", ")}`);
      continue;
    }
    const byTable = mine[f.path];
    if (byTable) {
      const hit = Object.keys(byTable).filter((t) => together.has(t)).sort();
      if (!hit.length) continue;
      const lines = substantiveLines(diffOf(f.path), f.path);
      if (!lines.length) continue;
      const label = (/** @type {string} */ t) => {
        const cols = byTable[t] ?? [];
        return cols.length && cols[0] !== "*" ? `${t}(${cols.length}칸)` : t;
      };
      reasons.push(`등록된 쓰기 파일 \`${f.path}\` 변경(${lines.length}줄) — 표: ${hit.map(label).join(", ")}`);
    }
  }
  return { notify: reasons.length > 0, reasons };
}

/**
 * 마이그 통보에는 "DB 반영 시각" 칸을 둔다 — 마이그는 대개 합치기 전에 대시보드로 먼저 적용돼
 * 이 이슈가 DB 변경보다 늦다. 적용한 사람이 채운다.
 * @param {{ reasons: string[], commitTitle: string, commitUrl: string, sha: string }} p
 */
export function buildIssue({ reasons, commitTitle, commitUrl, sha }) {
  const title = `[→미분양] ${commitTitle}`.slice(0, 250);
  const hasMigration = reasons.some((r) => r.startsWith(MIGRATION_REASON));
  const body = [
    "2u(naver-estate-web) 레포 main 에 공유 DB 를 건드린 커밋이 합쳐졌습니다(자동 통보 · `frontend/scripts/notify-sister.mjs`).",
    "",
    "**통보 사유**",
    ...reasons.map((r) => `- ${r}`),
    "",
    ...(hasMigration ? ["**DB 반영 시각**: (적용한 사람이 채움)", ""] : []),
    `**커밋** ${commitUrl} (\`${sha.slice(0, 8)}\`)`,
    "",
    "칸별 소유는 정본(미분양 레포 `supabase/ownership.json`)을 보세요.",
    "",
    "읽고 조치했으면 이 이슈를 닫아 주세요(닫음 = 읽음). 14일 동안 안 닫히면 `stale-unread` 라벨이 붙어 자동으로 닫힙니다.",
  ].join("\n");
  return { title, body };
}

/**
 * 14일 넘은 열린 통보 이슈 고르기.
 * @param {{ number: number, createdAt: string }[]} issues
 * @param {Date} now
 */
export function pickStale(issues, now) {
  const limit = now.getTime() - STALE_DAYS * 86400_000;
  return issues.filter((i) => new Date(i.createdAt).getTime() < limit).map((i) => i.number);
}

/**
 * 비교 기준 고르기 — push 의 before 가 있고(새 가지 첫 push 는 0 만 40자) 그 커밋을 가지고 있으면 그것, 아니면 HEAD~1.
 * @param {string | undefined} before
 * @param {(sha: string) => boolean} hasCommit
 */
export function pickBase(before, hasCommit) {
  if (before && /^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before) && hasCommit(before)) return before;
  return "HEAD~1";
}

/**
 * 본체 — git·gh 를 주입받는다(시험은 가짜를 넣는다).
 * `base` = 비교 기준 — push 이벤트의 `github.event.before`(한 번에 여러 커밋을 밀어도 전부 본다),
 * 없으면 HEAD~1(squash 합침 = PR 전체가 한 커밋).
 * @param {{ git: (args: string[]) => string, gh: (args: string[]) => string, registry: any, readFile: (p: string) => string, commitUrl: string, now: Date, base?: string, force?: boolean, dryRun?: boolean, log?: (s: string) => void }} deps
 */
export function runNotify({ git, gh, registry, readFile, commitUrl, now, base = "HEAD~1", force = false, dryRun = false, log = console.log }) {
  const changed = git(["diff", "--name-status", base, "HEAD"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return { status: parts[0], path: parts[parts.length - 1] };
    });
  const commitTitle = git(["log", "-1", "--format=%s"]).trim();
  const authors = git(["log", "--format=%an", `${base}..HEAD`])
    .split("\n")
    .map((a) => a.trim())
    .filter(Boolean);
  const sha = git(["rev-parse", "HEAD"]).trim();
  const decision = decideNotice({
    registry,
    changed,
    diffOf: (p) => git(["diff", base, "HEAD", "--", p]),
    readFile,
    commitTitle,
    authors,
    force,
  });

  /** @type {{ created: boolean, closed: number[] }} */
  const result = { created: false, closed: [] };
  if (decision.notify) {
    const { title, body } = buildIssue({ reasons: decision.reasons, commitTitle, commitUrl, sha });
    log(`통보: ${title}\n${decision.reasons.map((r) => `  - ${r}`).join("\n")}`);
    if (!dryRun) {
      const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "notify-")), "body.md");
      fs.writeFileSync(bodyFile, body);
      gh(["label", "create", LABEL, "--color", "0E8A16", "--description", "미분양에 보내는 공유 DB 통보(닫음 = 읽음)", "--force"]);
      gh(["issue", "create", "--label", LABEL, "--title", title, "--body-file", bodyFile]);
      result.created = true;
    }
  } else {
    log(`통보 없음${decision.skipped ? ` (${decision.skipped})` : ""}`);
  }

  // 14일 지난 열린 통보 이슈 → stale-unread 붙여 닫기
  const open = JSON.parse(gh(["issue", "list", "--label", LABEL, "--state", "open", "--json", "number,createdAt", "--limit", "100"]) || "[]");
  const stale = pickStale(open, now);
  if (stale.length && !dryRun) {
    gh(["label", "create", STALE_LABEL, "--color", "BFBFBF", "--description", "14일 동안 안 읽힌 채 자동으로 닫힌 통보", "--force"]);
    for (const n of stale) {
      gh(["issue", "edit", String(n), "--add-label", STALE_LABEL]);
      gh(["issue", "close", String(n), "--reason", "not planned", "--comment", `읽지 않은 채 닫힘 — 열린 지 ${STALE_DAYS}일이 지나 자동으로 닫았습니다(notify-sister).`]);
    }
    result.closed = stale;
  }
  if (stale.length) log(`${STALE_DAYS}일 지난 통보 ${stale.length}건 ${dryRun ? "(dry-run — 닫지 않음)" : "닫음"}: ${stale.join(", ")}`);
  return { decision, ...result };
}

/**
 * 정본 읽기 — 경로가 없거나 파일·모양이 틀리면 null(호출부가 exit 1).
 * @param {string | undefined} file
 */
export function loadRegistry(file) {
  if (!file || !fs.existsSync(file)) return null;
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  if (registry?.version !== 1 || !registry?.writers?.["2u"] || !registry?.tables) return null;
  return registry;
}

function main() {
  const registry = loadRegistry(process.env.OWNERSHIP_REGISTRY_PATH);
  if (!registry) {
    console.error(`정본 없음 — OWNERSHIP_REGISTRY_PATH(${process.env.OWNERSHIP_REGISTRY_PATH ?? "비어 있음"})에 미분양 supabase/ownership.json(version 1 · writers.2u)이 없습니다. 통보를 판정할 수 없어 실패로 끝냅니다.`);
    return 1;
  }
  /** @param {string} cmd */
  const runner = (cmd) => (/** @type {string[]} */ args) => execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const git = runner("git");
  runNotify({
    git,
    base: pickBase(process.env.NOTIFY_BEFORE, (sha) => {
      try {
        git(["cat-file", "-e", `${sha}^{commit}`]);
        return true;
      } catch {
        return false;
      }
    }),
    gh: runner("gh"),
    registry,
    readFile: (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8"),
    commitUrl: process.env.COMMIT_URL ?? "(로컬)",
    now: new Date(),
    force: process.env.NOTIFY_FORCE === "1",
    dryRun: process.argv.includes("--dry-run"),
  });
  return 0;
}

// CLI 로 직접 실행될 때만(파일명 끝 비교 — 시험에서 import 할 때는 안 돈다)
const cliName = (process.argv[1] ?? "").split("/").pop()?.split(String.fromCharCode(92)).pop() ?? "";
const isCLI = cliName !== "" && import.meta.url.endsWith(cliName);
if (isCLI) process.exit(main());
