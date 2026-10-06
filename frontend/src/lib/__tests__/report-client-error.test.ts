/**
 * 화면 오류 자동 보고(reportClientError) 시험 — 세션 439
 * 이 시험이 지키는 것: 운영 빌드에서만 보냄 · 토큰 안 붙음 · 같은 오류 한 방문 1통 · 5통 상한 ·
 * sessionStorage 가 막혀도 안 터짐 · 보내기 실패를 삼킴.
 * 실행: npx vitest run src/lib/__tests__/report-client-error.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reporter = typeof import("../report-client-error").reportClientError;

/** 모듈 안 메모리 기록까지 새로 시작하도록 매번 새로 불러온다 */
async function freshReporter(): Promise<Reporter> {
  vi.resetModules();
  return (await import("../report-client-error")).reportClientError;
}

function makeError(name: string, message: string, digest?: string) {
  const e = new Error(message);
  e.name = name;
  return digest ? Object.assign(e, { digest }) : e;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("reportClientError", () => {
  it("운영 빌드에서 오류 이름·첫 줄·화면 주소·digest 를 보낸다 (토큰 없음, keepalive)", async () => {
    const report = await freshReporter();
    report(makeError("TypeError", "x is undefined\n    at foo (a.js:1)", "d123"), "/complex/1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/opinions/error");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(JSON.parse(init.body as string)).toEqual({
      area: "/complex/1",
      name: "TypeError",
      message: "x is undefined",
      digest: "d123",
    });
  });

  it("화면 주소를 안 주면 지금 화면 경로(location.pathname)를 쓴다", async () => {
    const report = await freshReporter();
    report(makeError("Error", "boom"));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.area).toBe(window.location.pathname);
    expect(body).not.toHaveProperty("digest");
  });

  it("문구는 300자로 자른다", async () => {
    const report = await freshReporter();
    report(makeError("Error", "가".repeat(500)), "/");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.message).toHaveLength(300);
  });

  it("개발 빌드에서는 보내지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const report = await freshReporter();
    report(makeError("Error", "boom"), "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("같은 오류 3번 → 1통", async () => {
    const report = await freshReporter();
    for (let i = 0; i < 3; i++) report(makeError("TypeError", "same"), "/a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("다른 오류도 한 방문 5통까지만", async () => {
    const report = await freshReporter();
    for (let i = 0; i < 8; i++) report(makeError("Error", `오류 ${i}`), "/a");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("sessionStorage 가 막혀도 터지지 않고, 메모리 기록으로 같은 오류는 1통", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const report = await freshReporter();
    expect(() => {
      report(makeError("Error", "boom"), "/");
      report(makeError("Error", "boom"), "/");
    }).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("보내기 실패(네트워크 오류·동기 오류)는 조용히 삼킨다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const report = await freshReporter();
    expect(() => report(makeError("Error", "a"), "/")).not.toThrow();
    // 거부된 약속이 처리되지 않은 채 남지 않도록 한 틱 기다린다
    await new Promise((r) => setTimeout(r, 0));

    fetchMock.mockImplementationOnce(() => {
      throw new Error("sync");
    });
    expect(() => report(makeError("Error", "b"), "/")).not.toThrow();
  });
});
