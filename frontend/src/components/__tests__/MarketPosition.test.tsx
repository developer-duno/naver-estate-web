/**
 * MarketPosition isError 분기 테스트
 * 실행: npx vitest run src/components/__tests__/MarketPosition.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import MarketPosition from "../article/MarketPosition";
import { getPriceStats } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getPriceStats: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarketPosition — isError 분기", () => {
  it("getPriceStats 실패 시 null 반환 (silent failure 정정)", async () => {
    vi.mocked(getPriceStats).mockRejectedValue(new Error("500"));
    const { container } = render(
      <MarketPosition complexNo="C001" tradeTypeName="매매" area2M2={84.9} />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getPriceStats).toHaveBeenCalled());
    // isError → null 반환 (자식이 빈 박스 만들지 않음, 부모가 emptyHint 렌더)
    expect(container.firstChild).toBeNull();
  });

  it("area2M2=0 일 때도 null 반환 (분양권 0 falsy 결함 정정)", async () => {
    vi.mocked(getPriceStats).mockResolvedValue({
      complex_no: "C001",
      total_articles: 3,
      by_area: [{ label: "84m²", maemae: 50000, maemae_count: 3 }],
      by_floor: [],
    });
    const { container } = render(
      <MarketPosition complexNo="C001" tradeTypeName="매매" area2M2={0} />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getPriceStats).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
