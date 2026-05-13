/**
 * check-mdx-jsx.mjs scan() 단위 테스트
 * 실행: npx vitest run scripts/__tests__/check-mdx-jsx.test.mjs
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { scan } from "../check-mdx-jsx.mjs";

const FIXTURE = "scripts/__tests__/__fixture_mdx__";

describe("check-mdx-jsx.scan()", () => {
  beforeEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(FIXTURE, { recursive: true });
  });

  afterAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  it("안전 mdx — 위험 패턴 0건 검출", async () => {
    const file = join(FIXTURE, "safe.mdx");
    await writeFile(
      file,
      [
        "본문에 ≥1.5 충분, ≤50 쾌적 같은 유니코드 부등호 사용.",
        "마크다운 링크 [단지 상세](/mibunyang) 도 안전.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });

  it("162 사고 답습 — raw '<숫자' / '>숫자' / 단독 [/path/[id]] 검출", async () => {
    const file = join(FIXTURE, "risky.mdx");
    await writeFile(
      file,
      [
        "| 항목 | <1.0 부족 | >65 고밀 |",
        "본문 [/mibunyang/[id]] 단독 표기 위험.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    const patterns = hits.map((h) => h.pattern);
    expect(patterns).toContain("raw '<숫자'");
    expect(patterns).toContain("raw '>숫자'");
    expect(patterns).toContain("단독 [/path/[xxx]]");
  });

  it("화이트리스트 — 인라인 코드 백틱 + 펜스 코드 블록 통과", async () => {
    const file = join(FIXTURE, "whitelist-code.mdx");
    await writeFile(
      file,
      [
        "인라인 `<1.0 부족` 은 코드라 안전.",
        "```js",
        "if (x < 1.0) console.log(`>65 고밀`);",
        "```",
        "펜스 블록 위·아래 본문은 정상.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });

  it("마크다운 링크 컨텍스트 [/path/[no]](/search) — false positive 차단", async () => {
    const file = join(FIXTURE, "markdown-link.mdx");
    await writeFile(
      file,
      [
        "단지 페이지 [/complex/[no]](/search) 로 이동.",
        "검색 페이지 [/search/[keyword]](/search?q=).",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });

  it("164 확장 — raw '<=숫자' / '>=숫자' ASCII 검출", async () => {
    const file = join(FIXTURE, "risky-eq.mdx");
    await writeFile(
      file,
      [
        "| 항목 | <=1.0 이하 | >=65 이상 |",
        "| --- | --- | --- |",
        "| 측정 | <=50 쾌적 | >=80 고밀 |",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    const patterns = hits.map((h) => h.pattern);
    expect(patterns).toContain("raw '<=숫자'");
    expect(patterns).toContain("raw '>=숫자'");
  });

  it("164 확장 — ≤80% / ≥1.5 유니코드 안전 + raw '<숫자' lookahead 정상 (=숫자 미적용)", async () => {
    const file = join(FIXTURE, "safe-eq.mdx");
    await writeFile(
      file,
      [
        "유니코드 ≤80% 안전, ≥1.5 안전.",
        "본문 단순 부등호 미사용. 한글 '이하/이상' 표현 권장.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });
});
