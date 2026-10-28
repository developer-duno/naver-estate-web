/**
 * 새 지역 링크는 전부 미리 받기 끔(세션 484 PR 3c-1b · v2 O3) — 켜 두면 화면에 들어온 링크마다 허브·동·단지 장을 서버에서 미리 그려
 * 서버 렌더 열쇠 통이 몇 배로 찬다. next/link 를 가짜로 바꿔 prefetch 값을 data-prefetch 로 드러낸다.
 * 대상: /region 목록 253 링크 · 허브·동 장의 모든 링크 · 단지 화면 빵부스러기 · 가까운 단지 '전체 보기' · 푸터 /region 입구.
 * 실행: npx vitest run src/components/region/__tests__/links-prefetch.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { makeDong, makeHub } from "@/lib/seo/__tests__/region-fixture";
import { makeSummary } from "@/lib/seo/__tests__/summary-fixture";

vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));
vi.mock("next/link", () => ({
  default: ({ children, href, prefetch, ...props }: { children: ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

import RegionIndexPage from "@/app/region/page";
import RegionHubPage from "@/app/region/[sigungu5]/page";
import DongPageView from "@/app/region/[sigungu5]/[dong10]/page";
import ComplexBreadcrumb from "@/components/complex/public/ComplexBreadcrumb";
import NearbyComplexes from "@/components/complex/public/NearbyComplexes";
import Footer from "@/components/Footer";
import { complexCrumbs } from "@/lib/seo/complex-page";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** next/link 로 그린 링크(data-prefetch 가 있는 것)의 prefetch 값 — 일반 <a>(같은 장 앵커)는 빼고 */
function linkPrefetch(root: ParentNode): string[] {
  return [...root.querySelectorAll("a[data-prefetch]")].map((a) => a.getAttribute("data-prefetch")!);
}

describe("prefetch={false}", () => {
  it("/region 목록 — 빵부스러기 + 시군구 링크 253 전부", () => {
    const { container } = render(<RegionIndexPage />);
    const values = linkPrefetch(container);
    expect(values.length).toBeGreaterThanOrEqual(253);
    expect(new Set(values)).toEqual(new Set(["false"]));
  });

  it("허브 장 — 빵부스러기·동 칩·동 제목·단지 표·전체 링크 전부", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeHub()), { status: 200 }));
    const { container } = render(await RegionHubPage({ params: Promise.resolve({ sigungu5: "30200" }) }));
    const values = linkPrefetch(container);
    expect(values.length).toBeGreaterThan(15);
    expect(new Set(values)).toEqual(new Set(["false"]));
  });

  it("동 장 — 빵부스러기·단지 표·다른 동 칩·시군구 전체 보기 전부", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(makeDong()), { status: 200 }));
    const { container } = render(await DongPageView({ params: Promise.resolve({ sigungu5: "30200", dong10: "3020011800" }) }));
    const values = linkPrefetch(container);
    expect(values.length).toBeGreaterThan(15);
    expect(new Set(values)).toEqual(new Set(["false"]));
  });

  it("단지 화면 빵부스러기 · 가까운 단지(단지 링크 + 전체 보기)", () => {
    const s = makeSummary();
    const { container } = render(
      <>
        <ComplexBreadcrumb crumbs={complexCrumbs(s, true)} />
        <NearbyComplexes summary={s} regionPages />
      </>,
    );
    expect(container.querySelector('a[href="/region/30200/3020011800"][data-prefetch="false"]')).not.toBeNull();
    expect(container.querySelectorAll('a[href^="/region"][data-prefetch="false"]').length).toBe(
      container.querySelectorAll('a[href^="/region"]').length,
    );
    expect(new Set(linkPrefetch(container))).toEqual(new Set(["false"]));
  });

  it("푸터 '지역별 실거래가' → /region · 미리 받기 끔", () => {
    const { container } = render(<Footer />);
    const a = container.querySelector('a[href="/region"]');
    expect(a?.textContent).toBe("지역별 실거래가");
    expect(a?.getAttribute("data-prefetch")).toBe("false");
  });
});
