/**
 * crawl-job-labels ↔ BE plain_words.JOB_WORDS 이름 한 벌 가드
 *
 * 관리자 화면(이 사전)과 텔레그램 알림·달력(BE JOB_WORDS)이 같은 작업을 다른 이름으로
 * 부르지 않게, 두 사전의 이름을 키별로 글자까지 대조한다(사장님 결정: 이름은 한 벌).
 * 정본은 BE 쪽이다 — 여기서 실패하면 JOB_WORDS 를 보고 FE label 을 맞춘다.
 *
 * BE 파일은 같은 레포 안에 항상 있으므로, 못 읽으면 건너뛰지 않고 실패한다
 * (조용히 skip 되면 가드가 꺼진 줄 모른 채 초록이 된다).
 *
 * 실행: npx vitest run src/lib/__tests__/crawl-job-labels-sync.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { CRAWL_JOB_LABELS } from "../crawl-job-labels";

// src/lib/__tests__ → frontend → 레포 루트 → backend/crawler/plain_words.py
// (jsdom 환경의 전역 URL 은 file: 을 못 다뤄 new URL(…, import.meta.url) 이 실패한다 —
//  globals-css-font.test.ts 와 같은 dirname + resolve 방식을 쓴다)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAIN_WORDS_PATH = resolve(__dirname, "../../../../backend/crawler/plain_words.py");

/** plain_words.py 의 `JOB_WORDS: dict[str, str] = { ... }` 블록에서 "키": "값" 을 뽑는다 */
function extractJobWords(src: string): Record<string, string> {
  const block = src.match(/^JOB_WORDS\s*:[^=]*=\s*\{([\s\S]*?)^\}/m);
  if (!block) throw new Error("plain_words.py 에서 JOB_WORDS 블록을 찾지 못했다");
  const words: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*"([A-Za-z0-9_]+)"\s*:\s*"([^"]*)"\s*,/gm)) {
    words[m[1]] = m[2];
  }
  return words;
}

describe("crawl-job-labels 이름 = BE JOB_WORDS 이름", () => {
  const jobWords = extractJobWords(readFileSync(PLAIN_WORDS_PATH, "utf-8"));

  it("JOB_WORDS 를 제대로 읽었다 (추출 자체가 비면 아래 대조가 헛돈다)", () => {
    expect(Object.keys(jobWords).length).toBeGreaterThanOrEqual(Object.keys(CRAWL_JOB_LABELS).length);
    expect(jobWords.complex_articles).toBeDefined();
  });

  it("FE 사전의 모든 키가 JOB_WORDS 에 있고 label 이 글자까지 같다", () => {
    const mismatches: string[] = [];
    for (const [code, { label }] of Object.entries(CRAWL_JOB_LABELS)) {
      const be = jobWords[code];
      if (be === undefined) mismatches.push(`${code}: BE JOB_WORDS 에 없음 (FE="${label}")`);
      else if (be !== label) mismatches.push(`${code}: FE="${label}" ≠ BE="${be}"`);
    }
    expect(mismatches).toEqual([]);
  });
});
