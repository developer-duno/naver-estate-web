/**
 * /checklist 「계약 체크 목록」 모음 장 + /checklist/[type] 세입자·집주인 장(세션 514) · 매수인·매도인 장(세션 516) · 월세 세입자·집주인 장(세션 517)
 * 실행: npx vitest run src/app/__tests__/checklist.test.tsx
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

import ChecklistHubPage, { metadata as hubMetadata } from "../checklist/page";
import PartyChecklistPage, { dynamicParams, generateMetadata, generateStaticParams } from "../checklist/[type]/page";
import { CHECKLISTS } from "@/lib/broker/checklists";

const params = (type: string) => ({ params: Promise.resolve({ type }) });

describe("/checklist 모음 장", () => {
  it("h1 「계약 체크 목록」 · 설명 · 카드 6장(전세 세입자·집주인 · 월세 세입자·집주인 · 매수인·매도인 순 — 이름·항목 수·설명·링크)", () => {
    render(<ChecklistHubPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("계약 체크 목록");
    expect(
      screen.getByText(
        "아파트 전세·월세·매매 계약에서 세입자·집주인, 사는 사람·파는 사람이 각자 챙길 일을 법 조문과 함께 정리했습니다.",
      ),
    ).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(6);
    expect(within(cards[0]).getByRole("link")).toHaveAttribute("href", "/checklist/jeonse-tenant");
    expect(within(cards[0]).getByRole("heading", { level: 2 })).toHaveTextContent("전세 계약 체크리스트 — 세입자용");
    expect(cards[0]).toHaveTextContent("15항목");
    expect(cards[0]).toHaveTextContent(CHECKLISTS["jeonse-tenant"].description);
    expect(within(cards[1]).getByRole("link")).toHaveAttribute("href", "/checklist/jeonse-landlord");
    expect(cards[1]).toHaveTextContent("10항목");
    expect(cards.map((c) => within(c).getByRole("link").getAttribute("href"))).toEqual([
      "/checklist/jeonse-tenant",
      "/checklist/jeonse-landlord",
      "/checklist/wolse-tenant",
      "/checklist/wolse-landlord",
      "/checklist/sale-buyer",
      "/checklist/sale-seller",
    ]);
    expect(within(cards[2]).getByRole("heading", { level: 2 })).toHaveTextContent("월세 계약 체크리스트 — 세입자용");
    expect(cards[2]).toHaveTextContent("19항목");
    expect(within(cards[3]).getByRole("heading", { level: 2 })).toHaveTextContent("월세 계약 체크리스트 — 집주인용");
    expect(cards[3]).toHaveTextContent("12항목");
    expect(within(cards[4]).getByRole("heading", { level: 2 })).toHaveTextContent("집 살 때 체크리스트 — 매수인용");
    expect(cards[4]).toHaveTextContent("13항목");
    expect(cards[5]).toHaveTextContent("9항목");
  });

  it("맨 아래 중개사용 목록 줄 → /broker(전세·매매 둘 다 있어 허브로 — 세션 516)", () => {
    render(<ChecklistHubPage />);
    expect(screen.getByText(/공인중개사용 목록은/)).toHaveTextContent("공인중개사용 목록은 중개 실무에 있습니다.");
    expect(screen.getByRole("link", { name: "중개 실무" })).toHaveAttribute("href", "/broker");
  });

  it("메타 — title·canonical·og url·images(seo-metadata 룰 2·6)", () => {
    expect(hubMetadata.title).toBe("계약 체크 목록");
    expect(hubMetadata.alternates?.canonical).toBe("/checklist");
    const og = hubMetadata.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }> };
    expect(og.url).toBe("/checklist");
    expect(og.images?.[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
  });
});

describe("/checklist/[type] 장 — 「한도 계산 →」 링크(세션 520)", () => {
  it.each([
    ["jeonse-tenant", true],
    ["jeonse-landlord", true],
    ["wolse-tenant", true],
    ["wolse-landlord", true],
    ["sale-buyer", false],
    ["sale-seller", false],
  ])("%s 장에 있음=%s", async (type, shown) => {
    render(await PartyChecklistPage(params(type)));
    const link = screen.queryByRole("link", { name: "한도 계산 →" });
    if (shown) {
      expect(link).toHaveAttribute("href", "/broker/jeonse-guarantee");
      expect(screen.getByText(/이 목록에 넣지 않은 것/)).toContainElement(link);
    } else {
      expect(link).toBeNull();
    }
  });
});

describe("/checklist/[type] 장", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("세입자 — h1 · 단계 h2 4개 · 체크 상자 15개(전부 꺼짐) · 거래 고르기 없음", async () => {
    const { container } = render(await PartyChecklistPage(params("jeonse-tenant")));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("전세 계약 체크리스트 — 세입자용");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      CHECKLISTS["jeonse-tenant"].stages.map((s) => s.title),
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(15);
    for (const b of boxes) expect(b).not.toBeChecked();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ 새 거래" })).toBeNull();
    expect(container.querySelectorAll("ol > li")).toHaveLength(15);
    expect(screen.getByText(/법령 기준일/)).toHaveTextContent("2026. 11. 16.");
    // 법 원문 검사 반영 설명(세션 514)도 서버 렌더 글자에 그대로
    expect(screen.getByText("법은 집주인이 계약할 때 세입자에게 보여 주도록 정합니다.")).toBeInTheDocument();
    expect(screen.getByText("보증금 6천만원 초과 또는 월 차임 30만원 초과 계약이 대상입니다.")).toBeInTheDocument();
  });

  it("집주인 — 체크 상자 10개 · 계산기 링크는 사이트 안", async () => {
    render(await PartyChecklistPage(params("jeonse-landlord")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("전세 계약 체크리스트 — 집주인용");
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    const fee = screen.getByRole("link", { name: /중개수수료 계산기/ });
    expect(fee).toHaveAttribute("href", "/tools/brokerage-fee");
    expect(fee).not.toHaveAttribute("target");
  });

  it("← 계약 체크 목록 · 근거 링크 새 탭 · 넣지 않은 것 줄", async () => {
    render(await PartyChecklistPage(params("jeonse-tenant")));
    expect(screen.getByRole("link", { name: "← 계약 체크 목록" })).toHaveAttribute("href", "/checklist");
    const law = screen.getByRole("link", { name: /주택임대차보호법 제3조의3 제1항·제5항/ });
    expect(law).toHaveAttribute("href", "https://www.law.go.kr/법령/주택임대차보호법/제3조의3");
    expect(law).toHaveAttribute("target", "_blank");
    expect(law.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/이 목록에 넣지 않은 것/)).toHaveTextContent(
      "이 목록에 넣지 않은 것: 전세보증(HUG 등) 가입 요건 · 전세대출 조건 · 개별 특약 문구 · 조문 원문은 각 링크(법제처)에서 현행 내용을 봅니다.",
    );
  });

  it("정적 경로 = 전세 세입자·집주인 · 월세 세입자·집주인 · 매수인·매도인 · dynamicParams === false", () => {
    expect(generateStaticParams()).toEqual([
      { type: "jeonse-tenant" },
      { type: "jeonse-landlord" },
      { type: "wolse-tenant" },
      { type: "wolse-landlord" },
      { type: "sale-buyer" },
      { type: "sale-seller" },
    ]);
    expect(dynamicParams).toBe(false);
  });

  it("메타 — title·canonical·og url·images", async () => {
    const meta = await generateMetadata(params("jeonse-landlord"));
    expect(meta.title).toBe("전세 계약 체크리스트 — 집주인용");
    expect(meta.alternates?.canonical).toBe("/checklist/jeonse-landlord");
    const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }> };
    expect(og.url).toBe("/checklist/jeonse-landlord");
    expect(og.images?.[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
  });

  it("중개사용 유형·없는 유형 → notFound(/checklist/jeonse · /checklist/zz-unknown)", async () => {
    await expect(PartyChecklistPage(params("jeonse"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PartyChecklistPage(params("zz-unknown"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(2);
    expect(await generateMetadata(params("jeonse"))).toEqual({});
    await expect(PartyChecklistPage(params("sale"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("sale"))).toEqual({});
    // 세션 517 — 월세 중개사용(/checklist/wolse)도 404
    await expect(PartyChecklistPage(params("wolse"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("wolse"))).toEqual({});
  });

  it("매수인(세션 516) — h1 · 체크 상자 13개 · 대출 계산 항목은 단지 찾기 링크만 있고 「근거」 줄이 없다", async () => {
    const { container } = render(await PartyChecklistPage(params("sale-buyer")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("집 살 때 체크리스트 — 매수인용");
    expect(screen.getAllByRole("checkbox")).toHaveLength(13);
    // 근거 조문이 없는 대출 계산 항목도 합계에 든다
    expect(screen.getByText(/13개 중 0개 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    const loanTitle = "살 단지 화면에서 구입 대출 한도를 먼저 계산해 보기";
    const loanItem = screen.getByRole("checkbox", { name: loanTitle }).closest("li")!;
    expect(within(loanItem).getByRole("link", { name: /단지 찾기/ })).toHaveAttribute("href", "/search");
    expect(loanItem.textContent).not.toContain("근거");
    // 근거 줄은 근거 조문이 있는 12항목에만
    const withLaws = Array.from(container.querySelectorAll("ol > li")).filter((li) => li.textContent?.includes("근거"));
    expect(withLaws).toHaveLength(12);
  });

  it("매도인(세션 516) — h1 · 체크 상자 9개 · 양도소득세 계산기 링크 · 메타 canonical", async () => {
    render(await PartyChecklistPage(params("sale-seller")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("집 팔 때 체크리스트 — 매도인용");
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
    expect(screen.getByRole("link", { name: /양도소득세 계산기/ })).toHaveAttribute("href", "/tools/transfer-tax");
    const meta = await generateMetadata(params("sale-seller"));
    expect(meta.title).toBe("집 팔 때 체크리스트 — 매도인용");
    expect(meta.alternates?.canonical).toBe("/checklist/sale-seller");
  });

  it("월세 세입자(세션 517) — h1 · 단계 5개(사는 동안 — 월세) · 체크 상자 19개 · 거래 고르기 없음 · 넣지 않은 것 · 메타", async () => {
    render(await PartyChecklistPage(params("wolse-tenant")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("월세 계약 체크리스트 — 세입자용");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "계약 전 — 집과 집주인 확인",
      "계약",
      "계약 뒤 — 이사 날까지",
      "사는 동안 — 월세",
      "만기 때",
    ]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(19);
    expect(screen.getByText(/19개 중 0개 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/이 목록에 넣지 않은 것/)).toHaveTextContent(
      "이 목록에 넣지 않은 것: 보증금 반환보증(HUG 등) 가입 요건 · 개별 특약 문구",
    );
    const meta = await generateMetadata(params("wolse-tenant"));
    expect(meta.title).toBe("월세 계약 체크리스트 — 세입자용");
    expect(meta.alternates?.canonical).toBe("/checklist/wolse-tenant");
    expect((meta.openGraph as { url?: string }).url).toBe("/checklist/wolse-tenant");
  });

  it("월세 집주인(세션 517) — h1 · 체크 상자 12개 · 만기 때 첫 항목에 월세 연체 설명 · 메타 canonical", async () => {
    render(await PartyChecklistPage(params("wolse-landlord")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("월세 계약 체크리스트 — 집주인용");
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    const notice = screen
      .getByRole("checkbox", { name: /갱신 거절·조건 변경은 끝나기 6개월 전/ })
      .closest("li")!;
    expect(notice).toHaveTextContent("월세를 2기분 밀린 세입자에게는 자동 연장이 적용되지 않습니다.");
    const meta = await generateMetadata(params("wolse-landlord"));
    expect(meta.title).toBe("월세 계약 체크리스트 — 집주인용");
    expect(meta.alternates?.canonical).toBe("/checklist/wolse-landlord");
  });
});
