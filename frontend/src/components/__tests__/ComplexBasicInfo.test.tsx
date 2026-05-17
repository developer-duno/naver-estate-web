/**
 * ComplexBasicInfo 컴포넌트 테스트 — 단지 기본정보 행 렌더
 * 실행: npx vitest run src/components/__tests__/ComplexBasicInfo.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ComplexBasicInfo from "../ComplexBasicInfo";
import type { Complex } from "@/types";

/** 테스트용 단지 팩토리 */
function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return {
    complex_no: "C001",
    complex_name: "래미안테스트",
    address: "서울시 강남구 역삼동 123",
    total_household_count: 500,
    ...overrides,
  };
}

describe("ComplexBasicInfo", () => {
  it("거래유형별 매물 수 — 0보다 큰 유형만 표시", () => {
    render(
      <ComplexBasicInfo
        cpx={makeComplex({ trade_type_counts: { 매매: 12, 전세: 5, 월세: 0, 단기임대: 0 } })}
      />,
    );
    expect(screen.getByText("거래유형별 매물")).toBeInTheDocument();
    // 0인 월세/단기임대는 생략
    expect(screen.getByText("매매 12 · 전세 5")).toBeInTheDocument();
  });

  it("거래유형별 매물 수 전부 0 → 행 미표시", () => {
    render(
      <ComplexBasicInfo
        cpx={makeComplex({ trade_type_counts: { 매매: 0, 전세: 0, 월세: 0, 단기임대: 0 } })}
      />,
    );
    expect(screen.queryByText("거래유형별 매물")).not.toBeInTheDocument();
  });

  it("trade_type_counts 없으면 행 미표시 (크래시 없음)", () => {
    render(<ComplexBasicInfo cpx={makeComplex()} />);
    expect(screen.queryByText("거래유형별 매물")).not.toBeInTheDocument();
    // 기존 행은 정상 렌더
    expect(screen.getByText("주소")).toBeInTheDocument();
  });
});
