/**
 * 진행 상태 폴링 요청이 브라우저 캐시를 우회하는지 (cache: "no-store") 검증 — 세션 395.
 *
 * 서버(main.py security_headers_middleware)가 no-store 헤더를 붙이는 게 1차 방어이고,
 * 이 옵션은 프록시·미들웨어 회귀 시에도 브라우저가 폴링 응답을 저장하지 않게 하는 이중 방어다.
 * 캐시되면 크롤이 끝나도 화면이 "크롤 중"에 멈춘다(라이브 재현: 폴링 44회 중 서버 도착 1회).
 *
 * ⚠ 뮤테이션 검증 완료 — crawl.ts 의 `cache: "no-store"` 를 제거하면 아래 두 테스트가
 * 실패한다(세션 395 실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCrawlStatus, getPriceCollectStatus } from "@/lib/api";

/** fetch 두 번째 인자(RequestInit)를 캡처하기 위한 spy */
function spyFetch(body: unknown) {
  return vi
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
}

describe("진행 상태 폴링 — 브라우저 캐시 차단", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getCrawlStatus 는 cache: no-store 로 요청한다", async () => {
    const fetchSpy = spyFetch({ complex_no: "102102", status: "idle" });

    await getCrawlStatus("102102");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/articles/crawl-status");
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("getPriceCollectStatus 는 cache: no-store 로 요청한다", async () => {
    const fetchSpy = spyFetch({ complex_no: "102102", status: "idle" });

    await getPriceCollectStatus("102102");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/price-history/collect-status");
    expect((init as RequestInit).cache).toBe("no-store");
  });
});
