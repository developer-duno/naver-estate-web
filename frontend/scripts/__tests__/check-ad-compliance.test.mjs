/**
 * check-ad-compliance.mjs scan() 단위 테스트
 * 실행: npx vitest run scripts/__tests__/check-ad-compliance.test.mjs
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../check-ad-compliance.mjs";

// 워커별 고유 임시 디렉터리 — 고정 경로 공유 시 병렬 워커가 동시 rm 하다 EPERM 경합 (세션 195).
// scan() 은 절대경로 정상 처리. hits.file 은 임시폴더 절대경로가 되나 현 테스트는 file 미검증.
let FIXTURE;

describe("check-ad-compliance.scan()", () => {
  beforeEach(async () => {
    FIXTURE = await mkdtemp(join(tmpdir(), "adcheck-"));
  });

  afterEach(async () => {
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

  it("금융 구절(세션 482) 검출 · '대부분'·'토지임대부'·세금 특례 '신청하면'은 통과", async () => {
    const file = join(FIXTURE, "risky-loan.tsx");
    await writeFile(
      file,
      [
        "선순위가 있어도 대부 중개로 후순위로 해결",
        "무심사 · 한도 보장 · 승인 보장 · 최저 금리 · 대출 연결 · 대부업 · 대부중개",
        "지금 대출 신청하면 · 신청하면 대출이 바로",
        "대부분의 단지는 토지임대부 분양주택이 아니다 · 특례를 신청하면 보유기간이 길어진다",
      ].join("\n"),
    );
    const hits = await scan([FIXTURE]);
    expect(hits.map((h) => h.word)).toContain("대부 중개");
    expect(new Set(hits.map((h) => h.word))).toEqual(new Set([
      "대부 중개", "후순위로 해결", "무심사", "한도 보장", "승인 보장", "최저 금리", "대출 연결", "대부업", "대부중개",
      "대출 신청하면", "신청하면 대출",
    ]));
    expect(hits.every((h) => h.line !== 4)).toBe(true);
  });
});
