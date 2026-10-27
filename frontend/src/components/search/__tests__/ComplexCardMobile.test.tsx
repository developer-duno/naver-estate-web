/**
 * ComplexCardMobile — 검색 결과 단지 카드(모바일)의 이름 링크(세션 483 PR 3b)
 * 이름 글자만 진짜 링크 · 미리 받기 꺼짐 · 이름을 누르면 카드 클릭(router.push)과 두 번 이동하지 않는다.
 * 실행: npx vitest run src/components/search/__tests__/ComplexCardMobile.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import { ComplexCardMobile } from "../ComplexCardMobile";
import type { Complex } from "@/types";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>{children}</a>
  ),
}));

const complex = {
  complex_no: "123",
  complex_name: "테스트단지",
  cortar_address: "서울시 강남구",
  total_household_count: 500,
  use_approve_ymd: "20200101",
  real_estate_type_name: "아파트",
  article_count: 10,
} as Complex;

function renderCard() {
  return render(
    <TestQueryProvider>
      <ComplexCardMobile complex={complex} index={1} />
    </TestQueryProvider>,
  );
}

describe("ComplexCardMobile 이름 링크", () => {
  it("이름 글자가 진짜 링크 · 미리 받기 꺼짐", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "테스트단지" });
    expect(link).toHaveAttribute("href", "/complex/123");
    expect(link).toHaveAttribute("data-prefetch", "false");
  });

  it("이름 링크를 누르면 카드 클릭(router.push)은 불리지 않는다 · 카드의 다른 곳을 누르면 불린다", () => {
    nav.push.mockClear();
    renderCard();
    fireEvent.click(screen.getByRole("link", { name: "테스트단지" }));
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("서울시 강남구"));
    expect(nav.push).toHaveBeenCalledWith("/complex/123");
  });
});
