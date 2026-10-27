/**
 * 단지 화면 서버 껍데기(세션 483 PR 3b) — ISR 설정 · h1 하나 · 한눈에 보기(면적 수 = 표 행 수) · 같은 동 단지 최대 12 ·
 * 지역 페이지 플래그 false 동안 /region 링크 0 · BreadcrumbList · 없는 번호 404 · 5xx 는 throw.
 * 클라이언트 화면(ComplexClientView)은 가짜로 바꿔 서버가 그리는 것만 본다.
 * 실행: npx vitest run "src/app/complex/[no]/__tests__/page-server.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { makeSummary } from "@/lib/seo/__tests__/summary-fixture";

// 전역 test-setup 의 next/navigation 가짜에는 notFound 가 없다 — 진짜 notFound(digest "…;404" 를 던짐)를 쓴다
vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

vi.mock("../ComplexClientView", () => ({
  default: ({ glance }: { glance?: ReactNode }) => <div data-testid="client-view">{glance}</div>,
}));

import ComplexPage, { generateMetadata, generateStaticParams, revalidate } from "../page";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeSummary()), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const params = (no: string) => ({ params: Promise.resolve({ no }) });

async function renderPage(no = "6139") {
  return render(await ComplexPage(params(no)));
}

describe("ISR 설정", () => {
  it("빌드 때 안 그림(빈 배열) · 하루 revalidate", () => {
    expect(generateStaticParams()).toEqual([]);
    expect(revalidate).toBe(86400);
  });
});

describe("서버가 그리는 것", () => {
  it("h1 은 단지명 하나", async () => {
    const { container } = await renderPage();
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("햇살마을");
  });

  it("빵부스러기 5단계 · 지역 페이지 플래그 false 동안 /region 으로 가는 <a> 0", async () => {
    const { container } = await renderPage();
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav.textContent).toBe("홈›대전›유성구›봉명동›햇살마을");
    expect(container.querySelectorAll('a[href^="/region"]')).toHaveLength(0);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(JSON.stringify(ld)).not.toContain("/region");
  });

  it("'한눈에 보기' — 면적 수만큼 표 행 · 6개월 없으면 2년 · 공시가격·관리비·역·사용승인·세대수·동수 · 출처", async () => {
    await renderPage();
    const glance = within(screen.getByTestId("client-view")).getByTestId("complex-glance");
    const rows = within(glance).getByTestId("glance-areas").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toBe("84㎡4억 1,000만~4억 5,500만 · 최근 6개월6건");
    expect(rows[2].textContent).toBe("114㎡5억 2,000만~5억 6,000만 · 최근 2년(6개월 거래 없음)3건");
    const facts = within(glance).getByTestId("glance-facts").textContent ?? "";
    expect(facts).toContain("공시가격 2026 · 전용 84㎡3억 1,000만");
    expect(facts).toContain("한 달 관리비 · 2026.07약 22만 원");
    expect(facts).toContain("가까운 역봉명역 650m");
    expect(facts).toContain("사용승인1998년");
    expect(facts).toContain("세대수1,200세대");
    expect(facts).toContain("동수12개동");
    expect(facts).not.toContain("1500"); // 주차는 지금 화면에 안 보이는 값 — 싣지 않는다
    expect(glance.textContent).toContain("실거래 자료 2026.09까지");
  });

  it("같은 동 다른 단지 — 최대 12 링크 · 백엔드 순서 그대로 · 작은 글씨 = 6개월 범위, 없으면 공시가격", async () => {
    await renderPage();
    const box = screen.getByTestId("nearby-complexes");
    expect(within(box).getByRole("heading", { level: 2 }).textContent).toBe("봉명동 다른 단지");
    const links = within(box).getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(Array.from({ length: 12 }, (_, i) => `/complex/${7000 + i}`));
    expect(box.textContent).toContain("최근 6개월 4억~4억 4,000만");
    expect(box.textContent).toContain("공시가격 2억 8,000만");
    expect(box.textContent).toContain("자료 있는 다른 단지 14곳 중 12곳");
  });

  it("가까운 순(scope near, 결정 27) — 제목 '가까운 단지' · 작은 글씨 = 거리(1km 넘으면 km) · 가격 · 몇 곳 중 몇 곳 줄 없음", async () => {
    const base = makeSummary();
    const nearby = base.nearby.map((c, i) => ({ ...c, distance_m: [320, 1240][i] ?? 1500 + i * 10 }));
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...base, nearby, nearby_scope: "near" }), { status: 200 }));
    await renderPage();
    const box = screen.getByTestId("nearby-complexes");
    expect(within(box).getByRole("heading", { level: 2 }).textContent).toBe("가까운 단지");
    expect(box.textContent).toContain("320m · 최근 6개월 4억~4억 4,000만");
    expect(box.textContent).toContain("1.2km · 최근 6개월 4억 100만~4억 4,100만");
    expect(within(box).getAllByRole("link")).toHaveLength(12);
    expect(box.textContent).not.toContain("곳 중");
  });

  it("옛 응답(거리 없음)이면 거리만 빼고 그대로 그린다(배포 순서 안전)", async () => {
    await renderPage(); // 기본 재료 = distance_m 없음 · scope dong
    const box = screen.getByTestId("nearby-complexes");
    expect(box.textContent).not.toMatch(/\d+m ·|km ·/);
    expect(box.textContent).toContain("최근 6개월 4억~4억 4,000만");
  });

  it("범위가 시군구면 제목도 시군구", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeSummary({ nearby_scope: "sigungu" })), { status: 200 }));
    await renderPage();
    expect(within(screen.getByTestId("nearby-complexes")).getByRole("heading", { level: 2 }).textContent).toBe("유성구 다른 단지");
  });
});

describe("메타·404", () => {
  it("generateMetadata — 단지마다 제목·canonical·robots", async () => {
    const m = await generateMetadata(params("6139"));
    expect(m.title).toBe("햇살마을 실거래가·공시가격");
    expect(m.alternates?.canonical).toBe("/complex/6139");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("문자 번호 = 백엔드 안 부르고 404 · 5xx = throw(404 아님)", async () => {
    const digest = async (p: Promise<unknown>) => p.then(() => "ok", (e) => String((e as { digest?: string }).digest ?? e));
    expect(await digest(ComplexPage(params("abc")))).toContain("404");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    const r = await digest(ComplexPage(params("6139")));
    expect(r).not.toContain("404");
    expect(r).toContain("HTTP 503");
  });
});
