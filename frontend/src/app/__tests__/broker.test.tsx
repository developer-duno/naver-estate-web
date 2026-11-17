/**
 * /broker 「중개 실무」 페이지 — 제목·카드·링크 주소(세션 511 PR 1)
 * 실행: npx vitest run src/app/__tests__/broker.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import BrokerHubPage, { metadata } from "../broker/page";
import { UPCOMING_DATES } from "@/lib/broker/upcoming-dates";

describe("/broker 페이지", () => {
  it("h1 「중개 실무」 1개와 카드 제목 6개(「내 거래 신고 기한」은 「다가오는 날짜」 바로 아래 · 세션 519)", () => {
    render(<BrokerHubPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("중개 실무");
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      "다가오는 날짜",
      "내 거래 신고 기한",
      "거래 유형별 체크 목록",
      "자주 쓰는 계산",
      "서식 원문",
      "중개사 인증",
    ]);
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

  it("거래 유형별 체크 목록 — checklists.ts 중개사용 유형마다 버튼(「전세 →」 /broker/jeonse · 「월세 →」 /broker/wolse(세션 517) · 「매매 →」 /broker/sale — 세션 516)", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "거래 유형별 체크 목록" });
    const links = within(card).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/broker/jeonse", "/broker/wolse", "/broker/sale"]);
    expect(links[0]).toHaveTextContent("전세 →");
    expect(links[1]).toHaveTextContent("월세 →");
    expect(links[2]).toHaveTextContent("매매 →");
  });

  it("자주 쓰는 계산 — 맨 위 넓은 단추 「전세보증 한도」(세션 520) + 이미 있는 계산기 장 4개 + 계산기 전체", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "자주 쓰는 계산" });
    const hrefs = within(card).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/broker/jeonse-guarantee",
      "/tools/brokerage-fee",
      "/tools/acquisition-tax",
      "/tools/transfer-tax",
      "/tools/property-tax",
      "/tools",
    ]);
  });

  it("전세보증 한도 넓은 단추(세션 520) — 제목·작은 글·사이트 안 링크(새 창 아님)", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "자주 쓰는 계산" });
    const wide = within(card).getByRole("link", { name: /전세보증 한도/ });
    expect(wide).toHaveAttribute("href", "/broker/jeonse-guarantee");
    expect(wide).toHaveTextContent("HUG 산식 · 보증금이 들어가는지");
    expect(wide).not.toHaveAttribute("target");
  });

  it("서식 원문 — 법제처·법무부 공식 주소(https)만, 새 탭", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "서식 원문" });
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(2);
    const hosts = links.map((a) => new URL(a.getAttribute("href")!).host);
    expect(hosts).toEqual(["www.law.go.kr", "www.moj.go.kr"]);
    // 세션 513 — 판 번호 없는 법제처 한글 주소(서식 20)
    expect(links[0]).toHaveAttribute("href", "https://www.law.go.kr/법령별표서식/(공인중개사법시행규칙,서식20)");
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

  it("중개사 인증 — 인증 전용 기능만 안내(엑셀·데이터 갱신 · 비로그인에도 있는 실거래가는 적지 않음)", () => {
    render(<BrokerHubPage />);
    const card = screen.getByRole("region", { name: "중개사 인증" });
    expect(card).toHaveTextContent("매물 엑셀 내보내기");
    expect(card).toHaveTextContent("데이터 갱신");
    expect(card.textContent).not.toContain("실거래가");
  });

  it("메타 — canonical /broker · og url·images 명시(seo-metadata 룰 2·6)", () => {
    expect(metadata.alternates?.canonical).toBe("/broker");
    const og = metadata.openGraph as { url?: string; images?: Array<{ url: string }> };
    expect(og.url).toBe("/broker");
    expect(og.images?.[0]?.url).toBe("/opengraph-image");
    expect(String(metadata.title)).toContain("중개 실무");
    // 세션 520 — 설명에 전세보증 한도 계산기(llms.txt 와 같은 말)
    expect(metadata.description).toContain("전세보증 한도·중개수수료·세금 계산기");
  });
});
