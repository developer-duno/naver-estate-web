/**
 * CompetingListings isError 분기 테스트
 * 실행: npx vitest run src/components/__tests__/CompetingListings.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import CompetingListings from "../article/CompetingListings";
import { getArticles } from "@/lib/api";
import { formatKoreanPrice } from "@/lib/format";

vi.mock("@/lib/api", () => ({
  getArticles: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompetingListings — isError 분기", () => {
  it("getArticles 실패 시 null 반환 (silent failure 정정)", async () => {
    vi.mocked(getArticles).mockRejectedValue(new Error("500"));
    const { container } = render(
      <CompetingListings complexNo="C001" tradeTypeName="매매" currentArticleNo="A001" tokenReady />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getArticles).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});

// 세션 475 PR 6 — 같은 거래유형 중에서도 지금 매물과 같은 면적 묶음(소수점 버림)끼리만
describe("CompetingListings — 같은 면적 묶음끼리", () => {
  const page = {
    articles: [
      { article_no: "A001", complex_no: "C001", numeric_price: 60000, area2_m2: 84.97, price_per_pyeong: 2000 },
      { article_no: "A002", complex_no: "C001", numeric_price: 50000, area2_m2: 84.36, price_per_pyeong: 1900 },
      { article_no: "A003", complex_no: "C001", numeric_price: 70000, area2_m2: 84.1, price_per_pyeong: 2100 },
      { article_no: "A004", complex_no: "C001", numeric_price: 30000, area2_m2: 59.98, price_per_pyeong: 1500 },
    ],
    total: 4, page: 1, page_size: 20,
  };

  it("84.97㎡ 매물이면 84㎡ 대 매물만으로 건수·가격 범위·평당가", async () => {
    vi.mocked(getArticles).mockResolvedValue(page as never);
    const { findByText, getByText } = render(
      <CompetingListings complexNo="C001" tradeTypeName="매매" currentArticleNo="A001" areaM2={84.97} tokenReady />,
      { wrapper: TestQueryProvider },
    );
    expect(await findByText("같은 단지 매매 · 같은 면적(84㎡ 대)")).toBeInTheDocument();
    expect(getByText("2건")).toBeInTheDocument();
    expect(getByText(`${formatKoreanPrice(50000)} ~ ${formatKoreanPrice(70000)}`)).toBeInTheDocument();
    expect(getByText("2,000만원/평")).toBeInTheDocument(); // (1900+2100)/2 — 59㎡ 1500 은 빠진다
  });

  it("면적을 모르면 지금처럼 모든 면적", async () => {
    vi.mocked(getArticles).mockResolvedValue(page as never);
    const { findByText, getByText } = render(
      <CompetingListings complexNo="C001" tradeTypeName="매매" currentArticleNo="A001" areaM2={null} tokenReady />,
      { wrapper: TestQueryProvider },
    );
    expect(await findByText("같은 단지 매매")).toBeInTheDocument();
    expect(getByText("3건")).toBeInTheDocument();
    expect(getByText(`${formatKoreanPrice(30000)} ~ ${formatKoreanPrice(70000)}`)).toBeInTheDocument();
  });

  it("같은 면적 매물이 없으면 단독 매물 안내에 면적을 밝힌다", async () => {
    vi.mocked(getArticles).mockResolvedValue(page as never);
    const { findByText } = render(
      <CompetingListings complexNo="C001" tradeTypeName="매매" currentArticleNo="A004" areaM2={59.98} tokenReady />,
      { wrapper: TestQueryProvider },
    );
    expect(await findByText("같은 단지·같은 면적(59㎡ 대)에 매매 경쟁 매물이 없습니다 (단독 매물)")).toBeInTheDocument();
  });
});
