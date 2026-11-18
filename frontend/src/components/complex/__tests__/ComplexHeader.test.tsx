/**
 * ComplexHeader 회귀 가드 — Badge 적용 후 단지 유형 라벨 표시 + 즐겨찾기 토글
 * 실행: npx vitest run src/components/complex/__tests__/ComplexHeader.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ComplexHeader, { FavoriteCompareButtons } from "../ComplexHeader";
import type { Complex } from "@/types";

const baseComplex: Complex = {
  complex_no: "C001",
  complex_name: "래미안테스트",
  real_estate_type_name: "아파트",
};

describe("ComplexHeader", () => {
  it("단지명 + 매물유형 Badge 표시", () => {
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={() => {}} />
    );
    expect(screen.getByText("래미안테스트")).toBeInTheDocument();
    expect(screen.getByText("아파트")).toBeInTheDocument();
  });

  it("즐겨찾기 별 클릭 → onToggleFavorite 호출", async () => {
    const onToggle = vi.fn();
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={onToggle} />
    );
    await userEvent.click(screen.getByRole("button", { name: /즐겨찾기 추가/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("뒤로가기 클릭 → onBack 호출", async () => {
    const onBack = vi.fn();
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={onBack} onToggleFavorite={() => {}} />
    );
    await userEvent.click(screen.getByRole("button", { name: /이전 페이지/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("real_estate_type_name 없으면 Badge 미렌더", () => {
    const noType: Complex = { complex_no: "C002", complex_name: "이름만" };
    render(
      <ComplexHeader complex={noType} starred={false} onBack={() => {}} onToggleFavorite={() => {}} />
    );
    expect(screen.queryByText("아파트")).not.toBeInTheDocument();
  });
});

describe("ComplexHeader 비교 담기 (세션 296)", () => {
  it("onToggleCompare 미전달 시 비교 버튼 미렌더 (기존 호출처 안전)", () => {
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={() => {}} />
    );
    expect(screen.queryByText("+ 비교")).not.toBeInTheDocument();
  });

  it("비교 버튼 클릭 → onToggleCompare 호출", async () => {
    const onCompare = vi.fn();
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={() => {}} isCompared={false} compareFull={false} onToggleCompare={onCompare} />
    );
    await userEvent.click(screen.getByRole("button", { name: /래미안테스트 비교 추가/ }));
    expect(onCompare).toHaveBeenCalled();
  });

  it("isCompared=true → '✓ 비교중' 표시 + 해제 라벨", () => {
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={() => {}} isCompared={true} compareFull={false} onToggleCompare={() => {}} />
    );
    expect(screen.getByText("✓ 비교중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /래미안테스트 비교 해제/ })).toBeEnabled();
  });

  it("가득 참(compareFull) + 미포함 → disabled (silent no-op 차단)", () => {
    render(
      <ComplexHeader complex={baseComplex} starred={false} onBack={() => {}} onToggleFavorite={() => {}} isCompared={false} compareFull={true} onToggleCompare={() => {}} />
    );
    expect(screen.getByRole("button", { name: /비교 목록 가득 참/ })).toBeDisabled();
  });

  it("크롤 시각 배지는 사용자 언어 '매물 업데이트:' 로 표시 — 기준은 articles_crawled_at (세션 448)", () => {
    const withCrawl: Complex = {
      ...baseComplex,
      articles_crawled_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    };
    render(
      <ComplexHeader complex={withCrawl} starred={false} onBack={() => {}} onToggleFavorite={() => {}} />
    );
    expect(screen.getByText("매물 업데이트: 3시간 전")).toBeInTheDocument();
    expect(screen.queryByText(/마지막 크롤링/)).not.toBeInTheDocument();
  });

  it("last_crawled_at 만 있고 articles_crawled_at 이 없으면 배지를 그리지 않는다 (세션 448)", () => {
    const otherCollectorOnly: Complex = { ...baseComplex, last_crawled_at: new Date().toISOString() };
    render(
      <ComplexHeader complex={otherCollectorOnly} starred={false} onBack={() => {}} onToggleFavorite={() => {}} />
    );
    expect(screen.queryByText(/매물 업데이트:/)).not.toBeInTheDocument();
  });
});

/**
 * 남색 띠 안 단추(세션 524 B40 PR 1 · 설계 D4) — tone 기본값은 지금 모양 그대로(중개사 머리),
 * navy 는 글자 붙은 테두리 단추(높이 44px = min-h-11) · 누르면 글자·라벨이 바뀐다.
 */
describe("FavoriteCompareButtons tone", () => {
  it("기본 = 지금 모양(별 글자만 · 작은 비교 단추) — 중개사 머리 픽셀 변화 0", () => {
    render(<FavoriteCompareButtons name="래미안테스트" starred={false} onToggleFavorite={() => {}} isCompared={false} compareFull={false} onToggleCompare={() => {}} />);
    const star = screen.getByRole("button", { name: "즐겨찾기 추가" });
    expect(star.textContent).toBe("☆");
    expect(star.className).toContain("text-xl");
    expect(star.className).not.toContain("min-h-11");
    expect(screen.getByRole("button", { name: /비교 추가/ }).className).toContain("text-xs px-2.5 py-1");
  });

  it("navy = 「☆ 즐겨찾기」「+ 비교」 테두리 단추 · 높이 44px · 누르면 「★ 즐겨찾기」「✓ 비교중」", async () => {
    function Harness() {
      const [s, setS] = useState(false);
      const [c, setC] = useState(false);
      return (
        <FavoriteCompareButtons name="래미안테스트" tone="navy" starred={s} onToggleFavorite={() => setS((v) => !v)} isCompared={c} compareFull={false} onToggleCompare={() => setC((v) => !v)} />
      );
    }
    render(<Harness />);
    const star = screen.getByRole("button", { name: "즐겨찾기 추가" });
    const cmp = screen.getByRole("button", { name: "래미안테스트 비교 추가" });
    expect(star.textContent).toBe("☆즐겨찾기");
    expect(cmp.textContent).toBe("+ 비교");
    for (const b of [star, cmp]) expect(b.className).toContain("min-h-11");
    await userEvent.click(star);
    await userEvent.click(cmp);
    expect(screen.getByRole("button", { name: "즐겨찾기 해제" }).textContent).toBe("★즐겨찾기");
    const on = screen.getByRole("button", { name: "래미안테스트 비교 해제" });
    expect(on.textContent).toBe("✓ 비교중");
    expect(on.className).toContain("bg-white text-brand-navy");
  });

  it("navy · 가득 참 = 누를 수 없음", () => {
    render(<FavoriteCompareButtons name="래미안테스트" tone="navy" starred={false} onToggleFavorite={() => {}} isCompared={false} compareFull onToggleCompare={() => {}} />);
    expect(screen.getByRole("button", { name: /비교 목록 가득 참/ })).toBeDisabled();
  });
});
