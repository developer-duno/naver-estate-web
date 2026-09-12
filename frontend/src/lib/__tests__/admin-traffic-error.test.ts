/**
 * getAdminTraffic 래퍼 에러 전파 가드 (error-propagation.md 룰 3).
 *
 * 컴포넌트 테스트는 `vi.mock("@/lib/api")` 로 래퍼를 통째로 우회하므로 삼킴 회귀를
 * 절대 못 잡는다. 래퍼가 5xx 를 throw 하지 않고 빈 데이터로 바꿔치기하면 React Query
 * isError 가 prod 에서 발화하지 않아 TrafficCard 의 에러 UI 가 dead code 가 된다.
 *
 * 실행: npx vitest run src/lib/__tests__/admin-traffic-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { TrafficWindow } from "@/lib/api";

const API = "http://test-api:8000";

const server = setupServer(
  http.get(`${API}/api/admin/traffic`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth === "Bearer bad") {
      return HttpResponse.json({ detail: "관리자 권한이 필요합니다" }, { status: 403 });
    }
    if (auth === "Bearer boom") {
      return HttpResponse.json({ detail: "Server error" }, { status: 500 });
    }
    return HttpResponse.json({
      windows: {
        "10m": emptyWindow(),
        "1h": emptyWindow(),
        "24h": emptyWindow(),
      },
      process_uptime_seconds: 100,
      window_truncated: false,
      record_count: 0,
      max_records: 200000,
    });
  }),
);

// ⚠ 반환 타입을 명시한다 — 타입 미지정이면 TrafficWindow 로 문맥 타이핑되지 않아
//   계약에 필드가 추가돼도 tsc 가 이 픽스처의 결손을 못 잡는다(세션 399 적대검증:
//   visitors_capped 추가 시 형제 픽스처 2곳은 갱신됐는데 이 파일만 조용히 뒤처졌다).
function emptyWindow(): TrafficWindow {
  return {
    total_requests: 0,
    unique_visitors: 0,
    visitors_capped: false,
    p50_ms: 0,
    p95_ms: 0,
    rate_4xx: 0,
    rate_5xx: 0,
    top_paths: [],
    top_identities: [],
  };
}

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let admin: typeof import("@/lib/api/admin");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  admin = await import("@/lib/api/admin");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("getAdminTraffic 에러 전파", () => {
  it("정상 응답은 그대로 반환한다", async () => {
    const data = await admin.getAdminTraffic("good");
    expect(data.windows["1h"].total_requests).toBe(0);
    expect(data.max_records).toBe(200000);
  });

  it("5xx 는 삼키지 않고 reject 한다", async () => {
    await expect(admin.getAdminTraffic("boom")).rejects.toThrow();
  });

  it("403(권한 없음)도 reject 한다", async () => {
    await expect(admin.getAdminTraffic("bad")).rejects.toThrow();
  });
});
