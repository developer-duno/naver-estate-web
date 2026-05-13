#!/usr/bin/env node
/**
 * mdx JSX 파싱 충돌 회귀 가드 (GATE 10)
 *
 * 검사 대상: src/content/blog/*.mdx
 * 검출 패턴:
 *   (a) raw "<숫자"   — 표 cell <1.0, <60 등 JSX 시작 태그 오인
 *   (b) raw ">숫자"   — 표 cell >65, >30 등 JSX 시작 태그 오인
 *   (c) [/path/[xxx]] — 마크다운 링크 컨텍스트 아닌 단독 동적 라우트 표기
 *
 * 162 세션 답습:
 *   fix1 11a0891 — [/mibunyang/[id]] 의 [id] JSX 오인
 *   fix2 2264226 — 표 cell <1.0 / >65 / <60 등 raw 부등호 6행 JSX 오인
 *
 * 실행: node scripts/check-mdx-jsx.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const TARGETS = ["src/content/blog"];

const PATTERNS = [
  { name: "raw '<숫자'", re: /<(\d)/g },
  { name: "raw '>숫자'", re: /(^|[^=\->])>(\d)/g },
  { name: "단독 [/path/[xxx]]", re: /\[\/[^\]\n]*\[(\.\.\.)?[a-zA-Z][a-zA-Z0-9]*\][^\]\n]*\](?!\()/g },
];

function preprocess(content) {
  let body = content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const lines = body.split("\n");
  let inFence = false;
  return lines.map((line) => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      return "";
    }
    if (inFence) return "";
    return line.replace(/`[^`\n]*`/g, "``");
  });
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (/\.mdx$/.test(e.name)) {
      yield p;
    }
  }
}

export async function scan(targets = TARGETS) {
  const hits = [];
  for (const target of targets) {
    try {
      await stat(target);
    } catch {
      continue;
    }
    for await (const file of walk(target)) {
      const content = await readFile(file, "utf8");
      const lines = preprocess(content);
      lines.forEach((line, idx) => {
        for (const { name, re } of PATTERNS) {
          re.lastIndex = 0;
          if (re.test(line)) {
            hits.push({
              file: relative(".", file).replace(/\\/g, "/"),
              line: idx + 1,
              pattern: name,
              text: line.trim().slice(0, 120),
            });
          }
        }
      });
    }
  }
  return hits;
}

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`
  || process.argv[1]?.endsWith("check-mdx-jsx.mjs");

if (isMain) {
  const hits = await scan();
  if (hits.length === 0) {
    console.log("✅ mdx JSX 충돌 위험 패턴 0건");
    process.exit(0);
  }
  console.error(`🔴 mdx JSX 충돌 위험 패턴 ${hits.length}건 검출:\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line} — ${h.pattern}`);
    console.error(`    ${h.text}`);
  }
  console.error(
    `\nmdx-js-loader 가 JSX 시작 태그로 오인해 Turbopack build 실패 위험.\n` +
      `정정 답습:\n` +
      `  raw '<숫자' / '>숫자'  → '미만/초과/이상' 한글 표현 또는 ≥/≤ 유니코드\n` +
      `  단독 [/path/[id]]      → [표시 텍스트](/path) 마크다운 링크 형식\n` +
      `상세: 162 세션 fix1(11a0891) / fix2(2264226) git show 답습.`,
  );
  process.exit(1);
}
