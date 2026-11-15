/**
 * /broker 「중개 실무」 페이지 — 제목·카드·링크 주소(세션 511 PR 1)
 * 실행: npx vitest run src/app/__tests__/broker.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import BrokerHubPage, { metadata } from "../broker/page";
import { UPCOMING_DATES } from "@/lib/broker/upcoming-dates";

describe("/broker 페이지", () => {
  it("h1 「중개 실무」 1개와 카드 제목 4개", () => {
    render(<BrokerHubPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("중개 실무");
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(["다가오는 날짜", "자주 쓰는 계산", "서식 원문", "중개사 인증"]);
  });

  it("다가오는 날짜 — 자료의 항목마다 날짜·제목·출처 링크(새 탭 · noopener)", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "다가오는 날짜" });
    const items = within(card).getAllByRole("listitem");
    expect(items).toHaveLength(UPCOMING_DATES.length);
    UPCOMING_DATES.forEach((d, i) => {
      expect(items[i].querySelector("time")?.getAttribute("dateTime")).toBe(d.date);
      expect(items[i]).toHaveTextContent(d.title);
      const a = within(items[i]).getByRole("link", { name: new RegExp(`출처: ${d.sourceLabel.replace(/[()]/g, "\\$&")}`) });
      expect(a).toHaveAttribute("href", d.sourceUrl);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    });
  });

  it("자주 쓰는 계산 — 이미 있는 계산기 장 4개 + 계산기 전체", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "자주 쓰는 계산" });
    const hrefs = within(card).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/tools/brokerage-fee",
      "/tools/acquisition-tax",
      "/tools/transfer-tax",
      "/tools/property-tax",
      "/tools",
    ]);
  });

  it("서식 원문 — 법제처·법무부 공식 주소(https)만, 새 탭", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "서식 원문" });
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(2);
    const hosts = links.map((a) => new URL(a.getAttribute("href")!).host);
    expect(hosts).toEqual(["www.law.go.kr", "www.moj.go.kr"]);
    for (const a of links) {
      expect(a.getAttribute("href")!.startsWith("https://")).toBe(true);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("중개사 인증 — /verify 「공인중개사 인증하기」 + 단지 찾기 /", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "중개사 인증" });
    expect(within(card).getByRole("link", { name: "공인중개사 인증하기" })).toHaveAttribute("href", "/verify");
    expect(within(card).getByRole("link", { name: "단지 찾기" })).toHaveAttribute("href", "/");
  });

  it("메타 — canonical /broker · og url·images 명시(seo-metadata 룰 2·6)", () => {
    expect(metadata.alternates?.canonical).toBe("/broker");
    const og = metadata.openGraph as { url?: string; images?: Array<{ url: string }> };
    expect(og.url).toBe("/broker");
    expect(og.images?.[0]?.url).toBe("/opengraph-image");
    expect(String(metadata.title)).toContain("중개 실무");
  });
});
