/**
 * ComplexHeader 회귀 가드 — Badge 적용 후 단지 유형 라벨 표시 + 즐겨찾기 토글
 * 실행: npx vitest run src/components/complex/__tests__/ComplexHeader.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexHeader from "../ComplexHeader";
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
