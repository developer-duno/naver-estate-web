/**
 * api-direct.ts 회귀 가드 (세션 290 신규)
 *
 * 배경: V031 마이그(세션 261)로 anon 의 complexes/articles SELECT 가 차단(42501)됐다.
 * 백엔드 장애 시 프론트가 이 direct 함수로 폴백하는데, 기존 코드는 Supabase 의 error 를
 * 무시하고 `data ?? []` 로 빈 배열을 반환했다 → React Query 가 "성공 + 0건"으로 처리 →
 * "이 지역에 등록된 단지가 없습니다" 빈 화면으로 silent 위장(세션 290 도마동 사고).
 *
 * 이 테스트는 Supabase 가 error(42501) 를 반환할 때 각 direct 함수가 **throw** 하는지를
 * 강제한다. throw 해야 React Query 가 isError=true 로 잡아 "다시 시도" 에러 UI 를 띄운다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getComplexesByRegionDirect,
  searchComplexesDirect,
  getArticlesDirect,
  getStatsDirect,
  getRegionsDirect,
} from "@/lib/api-direct";

// ── Supabase 쿼리 빌더 모킹 ──
// api-direct 의 쿼리는 .from().select().eq()....limit()/range() 체이닝 후 await 된다.
// 체이닝 메서드는 자기 자신(thenable)을 반환하고, await 시 result 를 resolve 하게 만든다.

/** 체이닝 가능 + await 가능한 가짜 쿼리. result 를 then 으로 resolve. */
function makeQuery(result: { data: unknown; count?: number | null; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "ilike", "order", "range", "limit", "not"]) {
    q[m] = vi.fn(() => q);
  }
  // await q → result. PromiseLike 구현.
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

let mockResult: { data: unknown; count?: number | null; error: unknown };

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    from: vi.fn(() => makeQuery(mockResult)),
  }),
}));

// 42501 = PostgreSQL permission denied (V031 anon 차단 시 Supabase 가 돌려주는 코드)
const PERMISSION_DENIED = { code: "42501", message: "permission denied for table complexes" };

describe("api-direct — V031 anon 차단 시 silent 빈 배열 대신 throw (세션 290)", () => {
  beforeEach(() => {
    mockResult = { data: null, count: null, error: null };
  });

  describe("error(42501) 시 throw — 빈 배열 silent 반환 금지", () => {
    it("getComplexesByRegionDirect 는 error 시 throw 한다", async () => {
      mockResult = { data: null, count: null, error: PERMISSION_DENIED };
      await expect(
        getComplexesByRegionDirect("대전광역시", "서구", "도마동"),
      ).rejects.toThrow();
    });

    it("searchComplexesDirect 는 error 시 throw 한다", async () => {
      mockResult = { data: null, count: null, error: PERMISSION_DENIED };
      await expect(searchComplexesDirect("래미안")).rejects.toThrow();
    });

    it("getArticlesDirect 는 error 시 throw 한다", async () => {
      mockResult = { data: null, count: null, error: PERMISSION_DENIED };
      await expect(getArticlesDirect("C001")).rejects.toThrow();
    });

    it("getRegionsDirect 는 error 시 throw 한다", async () => {
      mockResult = { data: null, count: null, error: PERMISSION_DENIED };
      await expect(getRegionsDirect()).rejects.toThrow();
    });

    it("getStatsDirect 는 error 시 throw 한다", async () => {
      // getStatsDirect 는 head:true 라 data 없이 count/error 만 본다.
      mockResult = { data: null, count: null, error: PERMISSION_DENIED };
      await expect(getStatsDirect()).rejects.toThrow();
    });
  });

  describe("정상(error=null) 시 데이터 반환 — 회귀 방지", () => {
    it("getComplexesByRegionDirect 는 정상 시 단지 목록을 반환한다", async () => {
      const complexes = [{ complex_no: "127558", complex_name: "도마e편한세상포레나" }];
      mockResult = { data: complexes, count: 1, error: null };
      const res = await getComplexesByRegionDirect("대전광역시", "서구", "도마동");
      expect(res.complexes).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it("searchComplexesDirect 는 정상 시 검색 결과를 반환한다", async () => {
      mockResult = { data: [{ complex_no: "C001" }], count: 1, error: null };
      const res = await searchComplexesDirect("래미안");
      expect(res.complexes).toHaveLength(1);
    });

    it("getStatsDirect 는 정상 시 카운트를 반환한다", async () => {
      mockResult = { data: null, count: 42, error: null };
      const res = await getStatsDirect();
      expect(res.complex_count).toBe(42);
      expect(res.article_count).toBe(42);
    });
  });
});
