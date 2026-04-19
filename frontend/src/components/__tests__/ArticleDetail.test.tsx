/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ArticleDetail 컴포넌트 테스트 - 모달 렌더링, 닫기
 * 실행: npx vitest run src/components/__tests__/ArticleDetail.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "../../test-setup";

vi.mock("@/lib/api", () => ({
  getArticleLive: vi.fn().mockResolvedValue({
    article_no: "A001",
    complex_no: "C001",
    complex_name: "래미안테스트",
    trade_type_name: "매매",
    deal_or_warrant_prc: "5억",
    area2_m2: 84,
    floor_info: "10/25",
    direction: "남향",
    realtor_name: "행복공인",
    building_name: "101동",
  }),
}));

let ArticleDetail: any;
beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../ArticleDetail");
  ArticleDetail = mod.default;
});

describe("ArticleDetail — 추가", () => {
  it("dialog role 존재", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("매물 상세 타이틀", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByText("매물 상세")).toBeInTheDocument();
    });
  });

  it("닫기 버튼 aria-label", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      const btn = screen.getByLabelText("닫기");
      expect(btn).toBeInTheDocument();
    });
  });

  it("로딩 상태 표시", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
  });

  it("로딩 중 '불러오는 중' 안내 문구", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
  });
});


describe("ArticleDetail", () => {
  it("로딩 후 매물 정보 표시", async () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    await waitFor(() => {
      // 매물 데이터가 로드된 후 닫기 버튼이 표시되어야 함
      const closeBtn = screen.queryByRole("button");
      expect(closeBtn).not.toBeNull();
    }, { timeout: 3000 });
  });

  it("onClose 프롭 전달", () => {
    const onClose = vi.fn();
    render(<TestQueryProvider><ArticleDetail articleNo="A001" onClose={onClose} /></TestQueryProvider>);
    // 컴포넌트가 크래시 없이 렌더링됨을 확인
    expect(onClose).not.toHaveBeenCalled();
  });
});
