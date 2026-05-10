/**
 * check-ad-compliance.mjs scan() 단위 테스트
 * 실행: npx vitest run scripts/__tests__/check-ad-compliance.test.mjs
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { scan } from "../check-ad-compliance.mjs";

const FIXTURE = "scripts/__tests__/__fixture__";

describe("check-ad-compliance.scan()", () => {
  beforeEach(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(FIXTURE, { recursive: true });
  });

  afterAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
  });

  it("안전 콘텐츠 — 위험 단어 0건 검출", async () => {
    const file = join(FIXTURE, "safe.tsx");
    await writeFile(file, `export const x = "공인중개사용 분석 도구";\n`);
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });

  it("위험 단어 — '1등' / '보장합니다' 검출", async () => {
    const file = join(FIXTURE, "risky.mdx");
    await writeFile(
      file,
      `우리는 1등 서비스입니다.\n정확성을 보장합니다.\n`,
    );
    const hits = await scan([FIXTURE]);
    const words = hits.map((h) => h.word).sort();
    expect(words).toContain("1등");
    expect(words).toContain("보장합니다");
  });

  it("화이트리스트 — 객관 수치·면책·도메인 표현 통과", async () => {
    const file = join(FIXTURE, "whitelist.tsx");
    await writeFile(
      file,
      [
        "최고층 매물입니다.",
        "정확성을 보장하지 않습니다.",
        "공시 1등급 단지.",
        "주차 비중이 압도적으로 반영됩니다.",
        "절대 미분양 호수 기준.",
        "절댓값으로 표시.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });

  it("'확정합니다' / '확정했습니다' 단정 종결형 검출", async () => {
    const file = join(FIXTURE, "risky-confirm.mdx");
    await writeFile(
      file,
      [
        "산식을 100% 확정합니다.",
        "다출처로 검증을 확정했습니다.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    const words = hits.map((h) => h.word).sort();
    expect(words).toContain("확정합니다");
    expect(words).toContain("확정했습니다");
  });

  it("WHITELIST '확정하시기 바랍니다' / '확정 신고' / '확정 일자' 면책·법률 용어 보존", async () => {
    const file = join(FIXTURE, "whitelist-confirm.mdx");
    await writeFile(
      file,
      [
        "정확한 세액은 세무사 상담을 거쳐 확정하시기 바랍니다.",
        "양도소득세 확정 신고 기한은 5월 31일입니다.",
        "전세권 확정 일자 발급 절차 안내.",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits).toEqual([]);
  });
});
