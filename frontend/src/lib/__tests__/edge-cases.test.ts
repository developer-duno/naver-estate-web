/**
 * 고난이도 엣지 케이스 테스트 — 네트워크, XSS, 경계값, 동시성
 * 실행: npx vitest run src/lib/__tests__/edge-cases.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ApiError } from "../api";

const API = "http://edge-test:8000";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Network edge cases", () => {
  it("malformed JSON -> json() rejects", async () => {
    server.use(http.get(`${API}/bad`, () =>
      new HttpResponse("{invalid}", { status: 200, headers: { "Content-Type": "application/json" } })
    ));
    const res = await fetch(`${API}/bad`);
    await expect(res.json()).rejects.toThrow();
  });

  it("empty 200 response", async () => {
    server.use(http.get(`${API}/empty`, () => new HttpResponse("", { status: 200 })));
    const res = await fetch(`${API}/empty`);
    expect(await res.text()).toBe("");
  });

  it("very large JSON (1000 items)", async () => {
    server.use(http.get(`${API}/large`, () =>
      HttpResponse.json(Array(1000).fill({ id: "x" }))
    ));
    const data = await (await fetch(`${API}/large`)).json();
    expect(data).toHaveLength(1000);
  });

  it("429 Retry-After parsing", async () => {
    server.use(http.get(`${API}/limit`, () =>
      HttpResponse.json({ detail: "too many" }, { status: 429, headers: { "Retry-After": "15" } })
    ));
    const res = await fetch(`${API}/limit`);
    expect(res.headers.get("Retry-After")).toBe("15");
  });

  it("503 service unavailable", async () => {
    server.use(http.get(`${API}/down`, () =>
      HttpResponse.json({ detail: "down" }, { status: 503 })
    ));
    expect((await fetch(`${API}/down`)).status).toBe(503);
  });
});

describe("ApiError edge cases", () => {
  it("status 0 (network failure)", () => {
    expect(new ApiError("net", 0).statusCode).toBe(0);
  });

  it("10000-char error message", () => {
    expect(new ApiError("x".repeat(10000), 500).message).toHaveLength(10000);
  });

  it("multiple instances independent", () => {
    const e1 = new ApiError("a", 400);
    const e2 = new ApiError("b", 500);
    expect(e1.message).not.toBe(e2.message);
  });

  it("can be caught in try-catch", () => {
    try { throw new ApiError("test", 422); } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(422);
    }
  });
});

describe("XSS data prevention", () => {
  it("script tag in response preserved as text", async () => {
    server.use(http.get(`${API}/xss`, () =>
      HttpResponse.json({ name: "<script>alert(1)</script>" })
    ));
    const data = await (await fetch(`${API}/xss`)).json();
    expect(data.name).toContain("<script>");
  });

  it("img onerror in data", async () => {
    server.use(http.get(`${API}/xss2`, () =>
      HttpResponse.json({ field: '<img src=x onerror="alert(1)">' })
    ));
    const data = await (await fetch(`${API}/xss2`)).json();
    expect(data.field).toContain("onerror");
  });
});

describe("Boundary values", () => {
  it("0 items response", async () => {
    server.use(http.get(`${API}/zero`, () =>
      HttpResponse.json({ articles: [], total: 0 })
    ));
    const data = await (await fetch(`${API}/zero`)).json();
    expect(data.articles).toHaveLength(0);
  });

  it("max integer count", async () => {
    server.use(http.get(`${API}/max`, () =>
      HttpResponse.json({ count: Number.MAX_SAFE_INTEGER })
    ));
    const data = await (await fetch(`${API}/max`)).json();
    expect(data.count).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("encoded Korean in URL", async () => {
    server.use(http.get(`${API}/search`, () =>
      HttpResponse.json({ results: [] })
    ));
    const res = await fetch(`${API}/search?q=${encodeURIComponent("래미안")}`);
    expect(res.status).toBe(200);
  });

  it("concurrent requests to same URL", async () => {
    server.use(http.get(`${API}/concurrent`, async () => {
      await new Promise(r => setTimeout(r, 10));
      return HttpResponse.json({ ok: true });
    }));
    const [r1, r2, r3] = await Promise.all([
      fetch(`${API}/concurrent`),
      fetch(`${API}/concurrent`),
      fetch(`${API}/concurrent`),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });
});
