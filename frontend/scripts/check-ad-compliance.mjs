#!/usr/bin/env node
/**
 * 광고법 위험 단어 회귀 가드
 *
 * 검사 대상: blog mdx 20편 + app/components tsx
 * 검출 시 exit 1 + 위치·라인·문맥 출력
 *
 * 실행: node scripts/check-ad-compliance.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const TARGETS = ["src/app", "src/components", "src/content/blog"];

const RISKY = [
  "1등",
  "최고의",
  "최고급",
  "최강",
  "압도",
  "독보적",
  "유일한",
  "보장합니다",
  "확실합니다",
  "100% 정확",
  "절대 보장",
  "절대 안전",
  "절대 손해",
  "다른 곳보다",
  "타 서비스보다",
  "확정합니다",
  "확정했습니다",
  // 금융 구절(세션 482 PR 1b — 대출 참고 계산을 화면에 둔 뒤, 메인 결정 2026-10-26). 금융 문맥으로 좁힌 구절만 —
  // 맨 "대부"·"신청하면"은 넣지 않는다("대부분"·법률 용어 "토지임대부"·세금 특례 "신청하면" 등 정상 글 5곳 오탐).
  // 소비자 대출 카드 렌더 금지 낱말 시험(LoanEstimateSection.test.tsx)은 맨 "대부"·"신청하면"까지 그대로 본다.
  "대출 연결",
  "대부업",
  "대부 중개",
  "대부중개",
  "한도 보장",
  "승인 보장",
  "최저 금리",
  "무심사",
  "후순위로 해결",
  "대출 신청하면",
  "신청하면 대출",
];

const WHITELIST = [
  "1등급",
  "압도적으로 반영",
  "압도적으로 유리",
  "확정하시기 바랍니다",
  "확정 신고",
  "확정 일자",
];

function isWhitelisted(line) {
  return WHITELIST.some((w) => line.includes(w));
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(tsx|mdx)$/.test(e.name)) {
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
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (isWhitelisted(line)) return;
        for (const word of RISKY) {
          if (line.includes(word)) {
            hits.push({
              file: relative(".", file).replace(/\\/g, "/"),
              line: idx + 1,
              word,
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
  || process.argv[1]?.endsWith("check-ad-compliance.mjs");

if (isMain) {
  const hits = await scan();
  if (hits.length === 0) {
    console.log("✅ 광고법 위험 단어 0건");
    process.exit(0);
  }
  console.error(`🔴 광고법 위험 단어 ${hits.length}건 검출:\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line} — "${h.word}"`);
    console.error(`    ${h.text}`);
  }
  console.error(
    `\n광고법 위반 위험. 화이트리스트가 적정한지 확인하거나 표현 수정 필요.\n` +
      `허용 패턴 추가: scripts/check-ad-compliance.mjs WHITELIST.`,
  );
  process.exit(1);
}
