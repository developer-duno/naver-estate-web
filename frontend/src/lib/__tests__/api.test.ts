/**
 * API 유틸리티 테스트 — ApiError 클래스 검증
 * 실행: npx vitest run src/lib/__tests__/api.test.ts
 */
import { describe, it, expect } from "vitest";
import { ApiError } from "../api";

describe("ApiError", () => {
  it("message와 statusCode가 설정됨", () => {
    const error = new ApiError("Not Found", 404);
    expect(error.message).toBe("Not Found");
    expect(error.statusCode).toBe(404);
  });

  it("Error의 인스턴스", () => {
    const error = new ApiError("Server Error", 500);
    expect(error).toBeInstanceOf(Error);
  });

  it("name이 'ApiError'", () => {
    const error = new ApiError("Bad Request", 400);
    expect(error.name).toBe("ApiError");
  });

  it("429 에러 메시지 포맷", () => {
    const error = new ApiError("요청 한도를 초과했습니다. 60초 후 다시 시도해주세요.", 429);
    expect(error.statusCode).toBe(429);
    expect(error.message).toContain("60초");
  });
});
