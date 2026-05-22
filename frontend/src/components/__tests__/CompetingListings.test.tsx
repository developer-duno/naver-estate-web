/**
 * CompetingListings isError 분기 테스트
 * 실행: npx vitest run src/components/__tests__/CompetingListings.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import CompetingListings from "../article/CompetingListings";
import { getArticles } from "@/lib/api";

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
      <CompetingListings complexNo="C001" tradeTypeName="매매" currentArticleNo="A001" />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getArticles).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
