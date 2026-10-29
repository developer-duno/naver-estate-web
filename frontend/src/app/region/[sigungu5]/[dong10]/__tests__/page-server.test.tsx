/**
 * 동 페이지 서버 렌더(세션 484 PR 3c-1b · B6) — ISR 설정 · h1 하나 · 한 줄 · 단지 표(전부, 준공 포함) · 행정동별 동네 정보 카드 ·
 * 다른 동 칩 + 시군구 전체 보기 · 빵부스러기(시군구 = 허브 링크) · 메타(색인 스위치 켜짐 = indexable 따라 index,follow / noindex,follow) ·
 * 사라진 동 페이지 = 허브#동 307(임시) · 없는 동 404 · 5xx throw.
 * 실행: npx vitest run "src/app/region/[sigungu5]/[dong10]/__tests__/page-server.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { makeDong, makeHub } from "@/lib/seo/__tests__/region-fixture";

vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

import DongPageView, { generateMetadata, generateStaticParams, revalidate } from "../page";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeDong()), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const params = (sigungu5: string, dong10: string) => ({ params: Promise.resolve({ sigungu5, dong10 }) });
const renderPage = async () => render(await DongPageView(params("30200", "3020011800")));
const digest = async (p: Promise<unknown>) => p.then(() => "ok", (e) => String((e as { digest?: string }).digest ?? e));

describe("ISR 설정", () => {
  it("빌드 때 안 그림(빈 배열) · 하루 revalidate", () => {
    expect(generateStaticParams()).toEqual([]);
    expect(revalidate).toBe(86400);
  });
});

describe("동 페이지 본문", () => {
  it("h1 하나 · 한 줄(단지 N곳 · 실거래 범위 있는 단지 K곳)", async () => {
    const { container } = await renderPage();
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("대전 유성구 봉명동 아파트 실거래가·공시가격");
    expect(screen.getByTestId("region-dong-line").textContent).toBe("단지 13곳 · 실거래 범위 있는 단지 5곳");
  });

  it("단지 표 = 전부(13) · 준공 열 · 세대수 큰 순(없으면 뒤)", async () => {
    const { container } = await renderPage();
    const table = container.querySelector("table")!;
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toContain("준공");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(13);
    expect(rows[0].querySelector('th[scope="row"]')!.textContent).toBe("햇살마을12단지");
    expect(rows[0].querySelectorAll("td")[0].textContent).toBe("1,200세대");
    expect(rows[0].querySelectorAll("td")[1].textContent).toBe("2010년");
    expect(rows[12].querySelector("a")!.textContent).toBe("햇살마을13단지");
  });

  it("행정동별 동네 정보 카드 2 — 단지 화면 카드 3과 같은 부품(칸·띠·위험지도)", async () => {
    await renderPage();
    const cards = screen.getAllByTestId("dong-neighborhood-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("heading", { level: 3 }).textContent).toBe("온천1동");
    expect(cards[0].textContent).toContain("사업체 5,294곳");
    expect(cards[0].textContent).toContain("홍수 위험지도 영향 동");
    expect(cards[1].textContent).toContain("5만 4,325명");
  });

  it("다른 동 칩(동 페이지 링크) + 시군구 전체 보기(허브)", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "유성구 다른 동" });
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/region/30200/3020012000",
      "/region/30200/3020012700",
    ]);
    expect(screen.getByRole("link", { name: "유성구 전체 보기" }).getAttribute("href")).toBe("/region/30200");
  });

  it("빵부스러기 홈 › 대전 › 유성구(허브) › 봉명동 + BreadcrumbList", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav.textContent).toBe("홈›대전›유성구›봉명동");
    expect(within(nav).getByRole("link", { name: "유성구" }).getAttribute("href")).toBe("/region/30200");
    const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld.itemListElement.map((e: { name: string }) => e.name)).toEqual(["홈", "유성구", "봉명동"]);
  });

  it("동네 자료가 없으면 동네 정보 절 없음", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeDong({ neighborhood: [] })), { status: 200 }));
    await renderPage();
    expect(screen.queryAllByTestId("dong-neighborhood-card")).toHaveLength(0);
  });
});

describe("메타·실패 길", () => {
  it("generateMetadata — 제목·canonical·robots(색인 스위치 켜짐 = indexable 따라 index,follow / noindex,follow, 결정 37)", async () => {
    const m = await generateMetadata(params("30200", "3020011800"));
    expect(m.title).toBe("대전 유성구 봉명동 아파트 실거래가·공시가격");
    expect(m.alternates?.canonical).toBe("/region/30200/3020011800");
    expect(m.robots).toEqual({ index: true, follow: true });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeDong({ indexable: false })), { status: 200 }));
    expect((await generateMetadata(params("30200", "3020011800"))).robots).toEqual({ index: false, follow: true });
  });

  it("generateMetadata 는 이동·404 에 던지지 않고 최소 메타만(이동은 페이지 한 곳 — 첫 응답 location 머리 두 줄 방지, 보완 F11)", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/dongs/") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(makeHub()), { status: 200 }),
    );
    expect(await digest(generateMetadata(params("30200", "3020012900")))).toBe("ok"); // 허브엔 있음 = 페이지는 307
    expect(await digest(generateMetadata(params("30200", "3020099999")))).toBe("ok"); // 허브에도 없음 = 페이지는 404
    expect(await digest(generateMetadata(params("30200", "abc")))).toBe("ok");
    expect(await generateMetadata(params("30200", "3020012900"))).toEqual({ robots: { index: false, follow: false } });
  });

  it("동 페이지가 사라진 옛 주소(허브엔 그 동 있음) = 허브 안 그 동 묶음으로 307 redirect(임시 — 되살아날 수 있다)", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/dongs/") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(makeHub()), { status: 200 }),
    );
    const r = await digest(DongPageView(params("30200", "3020012900")));
    expect(r).toContain("NEXT_REDIRECT");
    expect(r).toContain("/region/30200#3020012900");
    expect(r).toContain(";307;");
  });

  it("허브에도 없는 동 = 404 · 다른 시군구 동 코드 = 백엔드 안 부르고 404 · 5xx = throw", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/dongs/") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(makeHub()), { status: 200 }),
    );
    expect(await digest(DongPageView(params("30200", "3020099999")))).toContain("404");
    fetchMock.mockClear();
    expect(await digest(DongPageView(params("30200", "3011011800")))).toContain("404");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    const r = await digest(DongPageView(params("30200", "3020011800")));
    expect(r).not.toContain("404");
    expect(r).toContain("HTTP 503");
  });
});
