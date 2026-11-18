/**
 * 새 틀 공통 부품 3개(세션 524 B40 PR 1) — 남색 띠 · 흰 카드 · 장 바탕.
 * 띠는 h1 이 하나뿐이고(장마다 h1 = 이것), 걸침(overlap)이면 아래 여백이 넓어지며, 안쪽 폭은 받은 클래스를 그대로 쓴다.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageBand, { PAGE_BAND_INNER_DEFAULT } from "../PageBand";
import BrandCard, { BRAND_CARD_CLASS } from "../BrandCard";
import BrandPage from "../BrandPage";

describe("PageBand", () => {
  it("남색 바탕 · h1 하나 · 작은 줄 · 설명 · 단추 자리를 순서대로 그린다", () => {
    render(
      <PageBand
        eyebrow={<span>홈 › 서울</span>}
        title="초원그린타운"
        description="1998년 사용승인 · 4,168세대"
        actions={<button type="button">단추</button>}
      />,
    );
    const band = screen.getByTestId("page-band");
    expect(band.className).toContain("bg-brand-navy");
    expect(band.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("초원그린타운");
    const text = band.textContent ?? "";
    expect(text.indexOf("홈 › 서울")).toBeLessThan(text.indexOf("초원그린타운"));
    expect(text.indexOf("초원그린타운")).toBeLessThan(text.indexOf("1998년 사용승인"));
    expect(screen.getByRole("button", { name: "단추" })).toBeInTheDocument();
  });

  it("없는 칸은 그리지 않는다 · 기본 안쪽 폭 = 홈과 같은 1160", () => {
    render(<PageBand title="제목만" />);
    const inner = screen.getByTestId("page-band").firstElementChild as HTMLElement;
    expect(inner.className).toContain(PAGE_BAND_INNER_DEFAULT);
    expect(inner.children).toHaveLength(1); // h1 하나
    expect(inner.className).toContain("pb-6");
  });

  it("overlap = 아래 카드가 걸칠 여백(pb-[88px]) · 안쪽 폭 클래스는 받은 그대로", () => {
    render(<PageBand title="단지" overlap innerClassName="mx-auto max-w-7xl px-4" />);
    const inner = screen.getByTestId("page-band").firstElementChild as HTMLElement;
    expect(inner.className).toContain("pb-[88px]");
    expect(inner.className).toContain("max-w-7xl px-4");
    expect(inner.className).not.toContain("max-w-[1160px]");
  });
});

describe("BrandCard · BrandPage", () => {
  it("흰 카드 = 둥근 모서리·그림자 + 받은 클래스 · as 로 section", () => {
    render(
      <BrandCard as="section" className="p-5" aria-labelledby="t" data-testid="c">
        <h2 id="t">제목</h2>
      </BrandCard>,
    );
    const c = screen.getByTestId("c");
    expect(c.tagName).toBe("SECTION");
    expect(c.className).toBe(`${BRAND_CARD_CLASS} p-5`);
    expect(screen.getByRole("region", { name: "제목" })).toBe(c);
  });

  it("기본은 div · 장 바탕은 회청 바탕이 바닥글 위까지(-mb-16 pb-16)", () => {
    render(
      <BrandPage>
        <BrandCard data-testid="c">x</BrandCard>
      </BrandPage>,
    );
    expect(screen.getByTestId("c").tagName).toBe("DIV");
    expect(screen.getByTestId("brand-page").className).toBe("-mb-16 bg-brand-bg pb-16");
  });
});
