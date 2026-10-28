/**
 * 전국 지역 목록(/region, 세션 484 PR 3c-1b · B4 · 메인 결정 10-28 ⓐ) — 백엔드 호출 0 · h1 하나 · 시도 17묶음(<section id=시도>) ·
 * 시군구 허브 링크 253(색인 밖 영양군 포함) · 빵부스러기 · 메타(canonical /region · 색인 스위치 꺼짐 = noindex,nofollow, 결정 37).
 * 실행: npx vitest run src/app/region/__tests__/page.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", async () => ({ ...(await vi.importActual<typeof import("next/navigation")>("next/navigation")) }));

import RegionIndexPage, { metadata } from "../page";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("/region 목록", () => {
  it("h1 하나 · 시도 17묶음 · 허브 링크 253(영양군 47760 포함) · 백엔드 호출 0", () => {
    const { container } = render(<RegionIndexPage />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("전국 아파트 실거래가·공시가격 — 시도·시군구별");
    expect(container.querySelectorAll("section[id]")).toHaveLength(17);
    const hubLinks = [...container.querySelectorAll('section a[href^="/region/"]')].map((a) => a.getAttribute("href"));
    expect(hubLinks).toHaveLength(253);
    expect(hubLinks.every((h) => /^\/region\/\d{5}$/.test(h!))).toBe(true);
    expect(hubLinks).toContain("/region/47760");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("대전 묶음에 유성구 · 세종 묶음 = 세종시", () => {
    const { container } = render(<RegionIndexPage />);
    const daejeon = container.querySelector('section[id="대전"]')!;
    expect(daejeon.querySelector("h2")!.textContent).toBe("대전");
    expect(daejeon.querySelector('a[href="/region/30200"]')!.textContent).toBe("유성구");
    expect(container.querySelector('section[id="세종"] a')!.textContent).toBe("세종시");
  });

  it("빵부스러기 홈 › 전국 · 메타 canonical /region · noindex,nofollow(색인 스위치 꺼짐 — 3c-2 에서 켠다)", () => {
    render(<RegionIndexPage />);
    expect(screen.getByRole("navigation", { name: "현재 위치" }).textContent).toBe("홈›전국");
    expect(metadata.alternates?.canonical).toBe("/region");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe("전국 아파트 실거래가·공시가격 — 시도·시군구별");
  });
});
