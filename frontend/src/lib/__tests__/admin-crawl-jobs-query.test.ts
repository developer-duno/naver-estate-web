/**
 * getAdminCrawlJobs 래퍼 — 작업 유형(job_type)을 BE 에 넘기는지 가드.
 *
 * 화면 테스트(crawl/__tests__/page.test.tsx)는 vi.mock("@/lib/api") 로 래퍼를 우회하므로
 * 래퍼가 job_type 을 쿼리 문자열에 싣지 않아도 통과한다 — 그래서 래퍼 단에서 실제 요청 주소를 본다.
 * 5xx 는 빈 목록으로 바꿔치기하지 않고 reject 해야 한다(error-propagation.md 룰 3).
 *
 * 실행: npx vitest run src/lib/__tests__/admin-crawl-jobs-query.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";
let lastSearch = "";

const server = setupServer(
  http.get(`${API}/api/admin/crawl-jobs`, ({ request }) => {
    if (request.headers.get("Authorization") === "Bearer boom") {
      return HttpResponse.json({ detail: "Server error" }, { status: 500 });
    }
    lastSearch = new URL(request.url).search;
    return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
  }),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let admin: typeof import("@/lib/api/admin");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  admin = await import("@/lib/api/admin");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  lastSearch = "";
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getAdminCrawlJobs", () => {
  it("job_type 을 고르면 상태·쪽 번호와 함께 쿼리 문자열에 싣는다", async () => {
    await admin.getAdminCrawlJobs("ok", { status: "failed", job_type: "kapt_costs", page: 2 });
    const q = new URLSearchParams(lastSearch);
    expect(q.get("job_type")).toBe("kapt_costs");
    expect(q.get("status")).toBe("failed");
    expect(q.get("page")).toBe("2");
  });

  it("job_type 이 없으면 싣지 않는다(전체)", async () => {
    await admin.getAdminCrawlJobs("ok", { page: 1 });
    expect(new URLSearchParams(lastSearch).has("job_type")).toBe(false);
  });

  it("5xx 는 빈 목록으로 삼키지 않고 reject 한다", async () => {
    await expect(admin.getAdminCrawlJobs("boom", { page: 1 })).rejects.toThrow();
  });
});
