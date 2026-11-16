/**
 * /broker/[type] 「거래 유형별 체크 목록」 장 — 제목·단계·근거 링크·정적 경로·메타·없는 유형 404(세션 513 PR 2a)
 * 실행: npx vitest run src/app/__tests__/broker-type.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: notFoundMock,
}));

import BrokerChecklistPage, { dynamicParams, generateMetadata, generateStaticParams } from "../broker/[type]/page";
import { CHECKLISTS } from "@/lib/broker/checklists";

const params = (type: string) => ({ params: Promise.resolve({ type }) });

describe("/broker/[type] 장", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("h1 「전세 중개 체크 목록 — 공인중개사용」 1개 · 단계 h2 4개(자료 순서)", async () => {
    render(await BrokerChecklistPage(params("jeonse")));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("전세 중개 체크 목록 — 공인중개사용");
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(CHECKLISTS.jeonse.stages.map((s) => s.title));
    expect(h2).toHaveLength(4);
    expect(screen.getByText(/법령 기준일/)).toHaveTextContent("2026. 11. 16.");
  });

  it("항목 번호가 단계를 넘어 1~18 로 이어진다(ol start)", async () => {
    const { container } = render(await BrokerChecklistPage(params("jeonse")));
    const ols = Array.from(container.querySelectorAll("ol"));
    expect(ols.map((ol) => ol.getAttribute("start"))).toEqual(["1", "8", "13", "17"]);
    expect(container.querySelectorAll("ol > li")).toHaveLength(18);
  });

  it("근거 조문 링크는 법제처 주소 · 새 탭 · noopener", async () => {
    render(await BrokerChecklistPage(params("jeonse")));
    const law = screen.getByRole("link", { name: /공인중개사법 제25조의3/ });
    expect(law).toHaveAttribute("href", "https://www.law.go.kr/법령/공인중개사법/제25조의3");
    const lawLinks = screen.getAllByRole("link").filter((a) => a.getAttribute("href")!.startsWith("https://www.law.go.kr/법령/"));
    const lawCount = CHECKLISTS.jeonse.stages.flatMap((s) => s.items).reduce((n, i) => n + i.laws.length, 0);
    expect(lawLinks).toHaveLength(lawCount);
    for (const a of lawLinks) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("← 중개 실무 · 계산기 링크는 사이트 안 · 넣지 않은 것 줄", async () => {
    render(await BrokerChecklistPage(params("jeonse")));
    expect(screen.getByRole("link", { name: "← 중개 실무" })).toHaveAttribute("href", "/broker");
    const fee = screen.getByRole("link", { name: /중개수수료 계산기/ });
    expect(fee).toHaveAttribute("href", "/tools/brokerage-fee");
    expect(fee).not.toHaveAttribute("target");
    const form = screen.getByRole("link", { name: /서식 원문\(법제처\)/ });
    expect(form).toHaveAttribute("href", "https://www.law.go.kr/법령별표서식/(공인중개사법시행규칙,서식20)");
    expect(form).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/이 목록에 넣지 않은 것/)).toHaveTextContent("전세보증(HUG 등) 가입 요건");
  });

  it("항목마다 체크 상자(라벨 = 항목 제목) — 저장된 것이 없으면 전부 꺼짐 · 준비 중 자리표시 없음(PR 2b)", async () => {
    const { container } = render(await BrokerChecklistPage(params("jeonse")));
    const main = within(container as HTMLElement);
    const boxes = main.getAllByRole("checkbox");
    expect(boxes).toHaveLength(18);
    for (const b of boxes) expect(b).not.toBeChecked();
    expect(main.getByRole("checkbox", { name: "등기사항증명서로 권리관계 확인" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("준비 중");
  });

  it("정적 경로 = 전세·매매 · dynamicParams === false", () => {
    expect(generateStaticParams()).toEqual([{ type: "jeonse" }, { type: "sale" }]);
    expect(dynamicParams).toBe(false);
  });

  it("메타 — title·canonical·og url·images(seo-metadata 룰 2·6)", async () => {
    const meta = await generateMetadata(params("jeonse"));
    expect(meta.title).toBe("전세 중개 체크 목록 — 공인중개사용");
    expect(meta.alternates?.canonical).toBe("/broker/jeonse");
    const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }> };
    expect(og.url).toBe("/broker/jeonse");
    expect(og.images?.[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
  });

  it("없는 유형 → notFound", async () => {
    await expect(BrokerChecklistPage(params("wolse"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(await generateMetadata(params("wolse"))).toEqual({});
  });

  it("세입자·집주인용 유형은 이 장에서 열리지 않는다(/broker/jeonse-tenant → notFound · 세션 514)", async () => {
    await expect(BrokerChecklistPage(params("jeonse-tenant"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BrokerChecklistPage(params("jeonse-landlord"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("jeonse-tenant"))).toEqual({});
    // 세션 516 — 매수인·매도인용도 같다
    await expect(BrokerChecklistPage(params("sale-buyer"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BrokerChecklistPage(params("sale-seller"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("전세 머리에 「손님에게 보낼 목록: 세입자용 · 집주인용」 링크(세션 514)", async () => {
    render(await BrokerChecklistPage(params("jeonse")));
    const line = screen.getByText(/손님에게 보낼 목록:/);
    expect(line).toHaveTextContent("손님에게 보낼 목록: 세입자용 · 집주인용");
    expect(within(line).getByRole("link", { name: "세입자용" })).toHaveAttribute("href", "/checklist/jeonse-tenant");
    expect(within(line).getByRole("link", { name: "집주인용" })).toHaveAttribute("href", "/checklist/jeonse-landlord");
  });

  it("매매 장(세션 516) — h1 · 단계 h2 4개 · 체크 상자 15개 · 머리에 「손님에게 보낼 목록」 매수인용·매도인용 링크 2개", async () => {
    render(await BrokerChecklistPage(params("sale")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("매매 중개 체크 목록 — 공인중개사용");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      CHECKLISTS.sale.stages.map((s) => s.title),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(15);
    const line = screen.getByText(/손님에게 보낼 목록:/);
    const links = within(line).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/checklist/sale-buyer", "/checklist/sale-seller"]);
    expect(links.map((a) => a.textContent)).toEqual([CHECKLISTS["sale-buyer"].name, CHECKLISTS["sale-seller"].name]);
    expect(screen.getByRole("link", { name: /취득세 계산기/ })).toHaveAttribute("href", "/tools/acquisition-tax");
    const meta = await generateMetadata(params("sale"));
    expect(meta.title).toBe("매매 중개 체크 목록 — 공인중개사용");
    expect(meta.alternates?.canonical).toBe("/broker/sale");
  });
});
