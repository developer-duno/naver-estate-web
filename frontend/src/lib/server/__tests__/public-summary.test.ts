/**
 * 단지 공개 요약 받기(서버 전용, 세션 483 PR 3b · 설계 v2 O7) —
 * 숫자 아님·8자리 초과 = 백엔드를 부르지 않고 404 · 백엔드 404 = 404 · 429·5xx = throw(404 로 바꾸지 않는다) ·
 * 열쇠는 값이 있을 때만 머리로, 오류 글자에 열쇠 값 0 · 클라이언트 파일은 이 모듈을 부르지 않는다.
 * 실행: npx vitest run src/lib/server/__tests__/public-summary.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientSeedOf, fetchPublicSummary, loadSummary, ssrKeyHeaders } from "../public-summary";
import { makeSummary } from "@/lib/seo/__tests__/summary-fixture";

// 전역 test-setup 의 next/navigation 가짜에는 notFound 가 없다 — 진짜 notFound(digest "…;404" 를 던짐)를 쓴다
vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

const FAKE_KEY = "test-ssr-key-not-real";

function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e != null && String((e as { digest?: string }).digest ?? "").includes("404");
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("예외가 나지 않았다");
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  vi.stubEnv("SSR_SHARED_KEY", FAKE_KEY);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("loadSummary — 404 와 throw 가르기", () => {
  it.each(["abc", "12a", "", "123456789", "-1"])("번호 %j = 백엔드를 부르지 않고 notFound", async (no) => {
    expect(isNotFound(await caught(loadSummary(no)))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("백엔드 404 = notFound", async () => {
    respond(404, { detail: "단지를 찾을 수 없습니다" });
    expect(isNotFound(await caught(loadSummary("99999999")))).toBe(true);
  });

  it.each([429, 500, 503])("백엔드 %i = throw(notFound 아님 — 진짜 단지가 404 로 하루 굳지 않게)", async (status) => {
    respond(status);
    const e = await caught(loadSummary("6139"));
    expect(isNotFound(e)).toBe(false);
    expect(String(e)).toContain(`HTTP ${status}`);
    expect(String(e)).not.toContain(FAKE_KEY);
  });

  it("200 = 요약 그대로 · 주소·하루 revalidate · 열쇠 머리", async () => {
    respond(200, makeSummary());
    const s = await loadSummary("6139");
    expect(s.name).toBe("햇살마을");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/complexes/6139/public-summary");
    expect(init.next).toEqual({ revalidate: 86400 });
    expect(init.headers).toEqual({ "X-SSR-Key": FAKE_KEY });
  });
});

describe("열쇠", () => {
  it("앞뒤 공백·줄바꿈(PowerShell 로 넣을 때 붙는 \\r\\n)은 잘라서 머리로 — 줄바꿈 든 머리 값은 fetch 가 예외를 던진다", async () => {
    vi.stubEnv("SSR_SHARED_KEY", `  ${FAKE_KEY}\r\n`);
    expect(ssrKeyHeaders()).toEqual({ "X-SSR-Key": FAKE_KEY });
    respond(200, makeSummary());
    await fetchPublicSummary("6139");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "X-SSR-Key": FAKE_KEY });
  });

  it("값이 비면 머리를 붙이지 않는다", async () => {
    vi.stubEnv("SSR_SHARED_KEY", "  ");
    expect(ssrKeyHeaders()).toEqual({});
    respond(200, makeSummary());
    await fetchPublicSummary("6139");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });

  it("클라이언트 넘김 재료에 열쇠·안 보이는 칸(주차·등급·이웃) 0", () => {
    const seed = clientSeedOf(makeSummary());
    expect(Object.keys(seed).sort()).toEqual(["at", "basis_ym", "breadcrumb", "complex_no", "official_price", "subway"]);
    expect(JSON.stringify(seed)).not.toContain(FAKE_KEY);
  });

  it('이 모듈은 첫 줄이 import "server-only" · "use client" 파일은 lib/server 를 부르지 않는다', () => {
    const src = path.resolve(__dirname, "../../..");
    const self = readFileSync(path.resolve(__dirname, "../public-summary.ts"), "utf-8");
    expect(self.split("\n")[0].trim()).toBe('import "server-only";');
    expect(self).not.toContain("NEXT_PUBLIC_SSR");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "node_modules" && name !== "__tests__") walk(p);
        } else if (/\.(tsx?|jsx?)$/.test(name)) {
          const text = readFileSync(p, "utf-8");
          if (/^\s*["']use client["']/.test(text) && /from\s+["']@\/lib\/server\//.test(text)) offenders.push(p);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
