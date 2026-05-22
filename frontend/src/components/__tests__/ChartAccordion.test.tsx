/**
 * ChartAccordion hasContent / emptyHint 분기 테스트
 * 실행: npx vitest run src/components/__tests__/ChartAccordion.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChartAccordion from "../ChartAccordion";

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

describe("ChartAccordion — hasContent 분기", () => {
  it("hasContent=true (기본값) + 펼침 시 children 렌더", () => {
    render(
      <ChartAccordion title="시세 정보" defaultOpen>
        <p>실제 데이터</p>
      </ChartAccordion>,
    );
    expect(screen.getByText("실제 데이터")).toBeInTheDocument();
  });

  it("hasContent=false + 펼침 시 emptyHint 렌더, children 미렌더", () => {
    render(
      <ChartAccordion
        title="시세 정보"
        defaultOpen
        hasContent={false}
        emptyHint="시세 정보를 불러오지 못했습니다."
      >
        <p>실제 데이터</p>
      </ChartAccordion>,
    );
    expect(screen.getByText("시세 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("실제 데이터")).not.toBeInTheDocument();
  });

  it("hasContent=false + 접힘 상태에서는 emptyHint 도 미렌더", () => {
    render(
      <ChartAccordion title="시세 정보" hasContent={false} emptyHint="없음">
        <p>실제 데이터</p>
      </ChartAccordion>,
    );
    expect(screen.queryByText("없음")).not.toBeInTheDocument();
    // 펼치면 emptyHint 노출
    fireEvent.click(screen.getByText("시세 정보"));
    expect(screen.getByText("없음")).toBeInTheDocument();
  });
});
