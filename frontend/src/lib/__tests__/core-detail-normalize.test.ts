/**
 * normalizeDetail + fetchApi 에러 메시지 정규화 가드 (세션 307)
 * verify 폼 [object Object] 버그: FastAPI 422 의 body.detail 이 배열([{loc,msg,type}])인데
 * ApiError(배열) 로 들어가 String(배열)="[object Object],[object Object]" 로 깨지던 결함의 회귀 방지.
 * - normalizeDetail 순수함수: string passthrough / 배열 join / 빈배열·object 폴백
 * - fetchApi(core.ts:86) 래퍼 레벨: 422 배열 → 한국어 msg, 409 string → 그대로 (error-propagation.md MSW 가드 의무)
 * 실행: npx vitest run src/lib/__tests__/core-detail-normalize.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { normalizeDetail } from "@/lib/api/core";

// 테스트용 한국어 메시지 (pydantic v2 가 'Value error, ' 접두를 붙인 형태를 모사)
const MSG_BIZ = "사업자등록번호 형식이 올바르지 않습니다";
const MSG_PHONE = "연락처 형식이 올바르지 않습니다";

describe("normalizeDetail 순수함수", () => {
  it("string detail 은 그대로 반환 (409/404/422-string 한국어 보존)", () => {
    expect(normalizeDetail("이미 검증 신청이 존재합니다", 409)).toBe("이미 검증 신청이 존재합니다");
  });

  it("배열 detail 단건 → msg 추출 + 'Value error, ' 접두 제거", () => {
    const detail = [{ loc: ["body", "phone"], msg: `Value error, ${MSG_PHONE}`, type: "value_error" }];
    expect(normalizeDetail(detail, 422)).toBe(MSG_PHONE);
  });

  it("배열 detail 다건 → ' / ' 로 join (세션 307 콤마 깨짐 정확 재현 가드)", () => {
    const detail = [
      { loc: ["body", "business_number"], msg: `Value error, ${MSG_BIZ}`, type: "value_error" },
      { loc: ["body", "phone"], msg: `Value error, ${MSG_PHONE}`, type: "value_error" },
    ];
    const out = normalizeDetail(detail, 422);
    expect(out).toBe(`${MSG_BIZ} / ${MSG_PHONE}`);
    expect(out).not.toContain("[object Object]");
  });

  it("접두 없는 영문 msg(Field required 등)는 그대로 (앵커 ^ 정확매칭)", () => {
    const detail = [{ loc: ["body", "start_date"], msg: "Field required", type: "missing" }];
    expect(normalizeDetail(detail, 422)).toBe("Field required");
  });

  it("빈 배열 [] → 폴백 (truthy 빈문자열 회귀 차단)", () => {
    expect(normalizeDetail([], 422)).toBe("API 오류: 422");
  });

  it("null/undefined/object → 폴백", () => {
    expect(normalizeDetail(null, 500)).toBe("API 오류: 500");
    expect(normalizeDetail(undefined, 503)).toBe("API 오류: 503");
    expect(normalizeDetail({ foo: "bar" }, 400)).toBe("API 오류: 400");
  });

  it("msg 없는 비정상 원소 → String(item) 폴백 (방어적, 정상 케이스 아님)", () => {
    const detail = [{ loc: ["body"], type: "x" }];
    expect(typeof normalizeDetail(detail, 422)).toBe("string");
  });
});

const API = "http://test-api:8000";
const server = setupServer(
  http.post(`${API}/api/verify/submit`, () =>
    HttpResponse.json(
      {
        detail: [
          { loc: ["body", "business_number"], msg: `Value error, ${MSG_BIZ}`, type: "value_error" },
          { loc: ["body", "phone"], msg: `Value error, ${MSG_PHONE}`, type: "value_error" },
        ],
      },
      { status: 422 },
    ),
  ),
  http.post(`${API}/api/verify/dup`, () =>
    HttpResponse.json({ detail: "이미 검증 신청이 존재합니다" }, { status: 409 }),
  ),
  http.post(`${API}/api/verify/nodetail`, () => HttpResponse.json({}, { status: 400 })),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수 (article-live-404.test.ts 답습)
let fetchApi: <T>(path: string, options?: RequestInit) => Promise<T>;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  ({ fetchApi } = await import("@/lib/api/core"));
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("fetchApi — 422 배열 detail 정규화 (core.ts:86 회귀 가드)", () => {
  it("422 배열 detail → message 가 한국어 msg join, [object Object] 미포함", async () => {
    const err = (await fetchApi("/api/verify/submit", { method: "POST" }).catch((e) => e)) as Error & {
      statusCode?: number;
    };
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(422);
    expect(err.message).toContain(MSG_BIZ);
    expect(err.message).toContain(MSG_PHONE);
    expect(err.message).not.toContain("[object Object]");
  });

  it("409 string detail → message 그대로 (한국어 보존 회귀 가드)", async () => {
    const err = (await fetchApi("/api/verify/dup", { method: "POST" }).catch((e) => e)) as Error;
    expect(err.message).toBe("이미 검증 신청이 존재합니다");
  });

  it("detail 없는 4xx → 'API 오류: {status}' 폴백", async () => {
    const err = (await fetchApi("/api/verify/nodetail", { method: "POST" }).catch((e) => e)) as Error;
    expect(err.message).toBe("API 오류: 400");
  });
});
