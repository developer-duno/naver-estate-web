/**
 * API 유틸리티 테스트 — ApiError 클래스 + MSW 에러 응답 테스트
 * 실행: npx vitest run src/lib/__tests__/api.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ApiError } from "../api";

// ── MSW 서버 ──
const API = "http://test-api:8000";
const server = setupServer(
  http.get(`${API}/api/stats`, () =>
    HttpResponse.json({ complex_count: 10, article_count: 500 })
  ),
  http.get(`${API}/api/not-found`, () =>
    HttpResponse.json({ detail: "Not found" }, { status: 404 })
  ),
  http.get(`${API}/api/rate-limited`, () =>
    HttpResponse.json({ detail: "Too many" }, { status: 429, headers: { "Retry-After": "30" } })
  ),
  http.get(`${API}/api/server-error`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 })
  ),
  http.get(`${API}/api/complexes/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get("q");
    return HttpResponse.json({ complexes: [{ complex_no: "C1", complex_name: q }], total: 1 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── ApiError 클래스 ──

describe("ApiError", () => {
  it("message와 statusCode 설정", () => {
    const e = new ApiError("Not Found", 404);
    expect(e.message).toBe("Not Found");
    expect(e.statusCode).toBe(404);
  });

  it("Error 인스턴스", () => {
    expect(new ApiError("err", 500)).toBeInstanceOf(Error);
  });

  it("name은 ApiError", () => {
    expect(new ApiError("err", 400).name).toBe("ApiError");
  });

  it("429 메시지 포맷", () => {
    const e = new ApiError("요청 한도를 초과했습니다. 60초 후 다시 시도해주세요.", 429);
    expect(e.statusCode).toBe(429);
    expect(e.message).toContain("60초");
  });

  it("상속 체인 유지 (stack trace)", () => {
    const e = new ApiError("test", 400);
    expect(e.stack).toBeDefined();
  });
});

// ── MSW로 직접 fetch 테스트 ──

describe("MSW 에러 응답", () => {
  it("200 성공 응답", async () => {
    const res = await fetch(`${API}/api/stats`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.complex_count).toBe(10);
  });

  it("404 응답", async () => {
    const res = await fetch(`${API}/api/not-found`);
    expect(res.status).toBe(404);
  });

  it("429 Retry-After 헤더", async () => {
    const res = await fetch(`${API}/api/rate-limited`);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("500 서버 에러", async () => {
    const res = await fetch(`${API}/api/server-error`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.detail).toBe("Server error");
  });

  it("검색 쿼리 파라미터 전달", async () => {
    const res = await fetch(`${API}/api/complexes/search?q=래미안`);
    const data = await res.json();
    expect(data.complexes[0].complex_name).toBe("래미안");
    expect(data.total).toBe(1);
  });
});
