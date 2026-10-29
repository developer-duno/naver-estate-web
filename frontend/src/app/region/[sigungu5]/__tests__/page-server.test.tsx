/**
 * 시군구 허브 서버 렌더(세션 484 PR 3c-1b · B5) — ISR 설정 · h1 하나 · 한 줄 · 2년 흐름 카드 · 동 칩(동 페이지 = 링크 / 작은 동 = 앵커) ·
 * 동 묶음 앵커 id · 동 페이지 있는 동 12곳 + 전체 링크(결정 35) · 작은 동 전부 · 사실 배지(등급 글자 0 · C 빈칸, 결정 33·38) ·
 * 단지 이름 = 행 머리(th scope=row) · JSON-LD · 메타(색인 스위치 켜짐 = index,follow) · 404/throw.
 * 실행: npx vitest run "src/app/region/[sigungu5]/__tests__/page-server.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { makeHub } from "@/lib/seo/__tests__/region-fixture";

// 전역 test-setup 의 next/navigation 가짜에는 notFound 가 없다 — 진짜를 쓴다
vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

import RegionHubPage, { generateMetadata, generateStaticParams, revalidate } from "../page";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeHub()), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const params = (sigungu5: string) => ({ params: Promise.resolve({ sigungu5 }) });
const renderPage = async (code = "30200") => render(await RegionHubPage(params(code)));

describe("ISR 설정", () => {
  it("빌드 때 안 그림(빈 배열) · 하루 revalidate", () => {
    expect(generateStaticParams()).toEqual([]);
    expect(revalidate).toBe(86400);
  });
});

describe("허브 본문", () => {
  it("h1 하나 · 한 줄(단지·동·자료 기준) · 2년 흐름 카드", async () => {
    const { container } = await renderPage();
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("대전 유성구 아파트 실거래가·공시가격");
    expect(screen.getByTestId("region-hub-line").textContent).toBe("단지 16곳 · 동 2곳 · 자료 기준 2026.09");
    const trend = screen.getByTestId("region-trend");
    expect(trend.textContent).toContain("유성구 아파트는 2년 동안 중위 매매가 4억→4억 600만 · 전세가율 69.2%→69.5%");
    expect(trend.textContent).toContain("한국부동산원 전국주택가격동향조사 2024.10~2026.09");
  });

  it("지역 추이가 없으면 카드 없음 · 한 줄에 자료 기준 없음", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeHub({ region_trend: null })), { status: 200 }));
    await renderPage();
    expect(screen.queryByTestId("region-trend")).toBeNull();
    expect(screen.getByTestId("region-hub-line").textContent).toBe("단지 16곳 · 동 2곳");
  });

  it("동 칩 — 동 페이지 있는 동 = 동 페이지 링크 · 작은 동 = 같은 장 앵커", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "유성구 동 목록" });
    expect([...nav.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["봉명동", "/region/30200/3020011800"],
      ["달빛동", "#3020012900"],
    ]);
  });

  it("동 묶음 = <section id=동코드> · 동 페이지 있는 동 = 세대수 큰 순 12곳 + '전체 13곳' 링크(결정 35)", async () => {
    const { container } = await renderPage();
    const big = container.querySelector('section[id="3020011800"]') as HTMLElement;
    expect(big).not.toBeNull();
    const rows = big.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(12);
    const households = [...rows].map((r) => r.querySelectorAll("td")[0].textContent);
    expect(households[0]).toBe("1,200세대");
    expect(households[11]).toBe("100세대");
    expect(big.textContent).not.toContain("햇살마을13단지"); // 세대수 없는 단지는 맨 뒤라 13번째 → 동 페이지에서
    const all = within(big).getByRole("link", { name: "봉명동 단지 전체 13곳 →" });
    expect(all.getAttribute("href")).toBe("/region/30200/3020011800");
    expect(within(big).getByRole("heading", { level: 2 }).querySelector("a")?.getAttribute("href")).toBe("/region/30200/3020011800");
  });

  it("작은 동 = 전부 · 제목은 글자 · 전체 링크 없음", async () => {
    const { container } = await renderPage();
    const small = container.querySelector('section[id="3020012900"]') as HTMLElement;
    const names = [...small.querySelectorAll("tbody tr")].map((r) => r.querySelector("a")!.textContent);
    expect(names).toEqual(["달빛마을2단지", "달빛마을1단지", "달빛마을3단지"]);
    expect(within(small).getByRole("heading", { level: 2 }).querySelector("a")).toBeNull();
    expect(small.textContent).not.toContain("전체");
  });

  it("단지 표 칸 — 이름 = 행 머리 링크 · 대표 면적 6개월 범위(없으면 —) · 공시가격 · 사실 배지(A 최근 2년 실거래 · B 실거래 없음 · C 빈칸, 등급 글자 0)", async () => {
    const { container } = await renderPage();
    const small = container.querySelector('section[id="3020012900"]') as HTMLElement;
    const rowsEl = [...small.querySelectorAll("tbody tr")];
    for (const r of rowsEl) expect(r.firstElementChild!.matches('th[scope="row"]')).toBe(true);
    const cells = rowsEl.map((r) => [...r.querySelectorAll("th, td")].map((td) => td.textContent));
    expect(cells[0]).toEqual(["달빛마을2단지", "300세대", "—", "3억 1,000만", "실거래 없음"]);
    expect(cells[1]).toEqual(["달빛마을1단지", "120세대", "—", "—", ""]);
    expect(cells[2]).toEqual(["달빛마을3단지", "80세대", "84㎡ 4억~4억 4,000만", "3억 1,000만", "최근 2년 실거래"]);
    // C 행의 자료 칸엔 배지 요소 자체가 없다(결정 38)
    expect(rowsEl[1].querySelectorAll("td")[3].querySelector("span")).toBeNull();
    expect(small.querySelector("a")!.getAttribute("href")).toBe("/complex/9202");
    const texts = [...container.querySelectorAll("td, span, a, p, h2")].map((el) => el.textContent?.trim());
    expect(texts.filter((t) => t === "A" || t === "B" || t === "C")).toEqual([]);
  });

  it("빵부스러기 홈 › 대전 › 유성구 + BreadcrumbList", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav.textContent).toBe("홈›대전›유성구");
    const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((e: { name: string }) => e.name)).toEqual(["홈", "유성구"]);
  });
});

describe("메타·404", () => {
  it("generateMetadata — 제목·canonical·robots(색인 스위치 켜짐 + indexable = index,follow, 결정 37)", async () => {
    const m = await generateMetadata(params("30200"));
    expect(m.title).toBe("대전 유성구 아파트 실거래가·공시가격");
    expect(m.alternates?.canonical).toBe("/region/30200");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("문자 코드 = 백엔드 안 부르고 404 · 백엔드 404 = 404 · 5xx = throw(404 아님)", async () => {
    const digest = async (p: Promise<unknown>) => p.then(() => "ok", (e) => String((e as { digest?: string }).digest ?? e));
    expect(await digest(RegionHubPage(params("abc")))).toContain("404");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    expect(await digest(RegionHubPage(params("00000")))).toContain("404");
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    const r = await digest(RegionHubPage(params("30200")));
    expect(r).not.toContain("404");
    expect(r).toContain("HTTP 503");
  });
});
