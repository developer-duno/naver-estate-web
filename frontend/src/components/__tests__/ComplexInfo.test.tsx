/**
 * ComplexInfo 컴포넌트 테스트 - 단지 정보 표시
 * 실행: npx vitest run src/components/__tests__/ComplexInfo.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ComplexInfo from "../ComplexInfo";
import type { Complex } from "@/types";

vi.mock("@/lib/api", () => ({
  getPriceStats: vi.fn().mockResolvedValue({
    complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
  }),
  getPriceHistory: vi.fn().mockResolvedValue({
    complex_no: "C001", items: [],
  }),
}));

const baseComplex: Complex = {
  complex_no: "C001",
  complex_name: "래미안테스트",
  address: "서울시 강남구 역삼동 123",
  total_household_count: 500,
};

describe("ComplexInfo", () => {
  it("탭 메뉴 표시", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("단지정보")).toBeInTheDocument();
    });
  });

  it("면적별 정보 탭 존재", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("면적별 정보")).toBeInTheDocument();
    });
  });

  it("면적별 가격 탭 존재", async () => {
    render(
      <ComplexInfo complex={baseComplex} pyeongDetails={[]} complexNo="C001" />
    );
    await waitFor(() => {
      expect(screen.getByText("면적별 가격")).toBeInTheDocument();
    });
  });

  it("null 필드에도 크래시 없음", async () => {
    const minimal: Complex = { complex_no: "C002", complex_name: "미니멀" };
    render(
      <ComplexInfo complex={minimal} pyeongDetails={[]} complexNo="C002" />
    );
    await waitFor(() => {
      expect(screen.getByText("단지정보")).toBeInTheDocument();
    });
  });
});
