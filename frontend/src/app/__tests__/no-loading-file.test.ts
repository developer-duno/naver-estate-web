/**
 * src/app 아래 loading.tsx 0개 가드 (세션 484 PR 3c-1a · 결정 36)
 *
 * 루트·조상 폴더에 loading.tsx 가 있으면 ISR 저장본 본문이 hidden 상자
 * (<div hidden id="S:0">)로 들어가 스크립트 안 도는 봇에 안 보인다
 * (세션 484 · 3b 적대 검사관 실측 — loading 을 빼면 0건).
 * 단지·지역 장의 조상에 다시 생기는 것을 막기 위해 어디에도 두지 않는다.
 * 대기 화면이 필요하면 components/LoadingSpinner.tsx 를 그 화면 안에서 쓴다.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

/** APP_DIR 아래 이름이 loading.(tsx|ts|jsx|js) 인 파일을 재귀로 모은다 */
function findLoadingFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findLoadingFiles(full));
    } else if (/^loading\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      found.push(relative(APP_DIR, full).replace(/\\/g, "/"));
    }
  }
  return found;
}

describe("src/app 아래 loading 파일", () => {
  it("하나도 없다 — 있으면 서버 렌더 본문이 숨김 상자로 들어간다", () => {
    expect(findLoadingFiles(APP_DIR)).toEqual([]);
  });
});
