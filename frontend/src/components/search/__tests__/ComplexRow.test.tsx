/**
 * ComplexRow 컴포넌트 테스트 — 검색 결과 단지 테이블 행
 * 실행: npx vitest run src/components/search/__tests__/ComplexRow.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import { ComplexRow } from "../ComplexRow";
import type { Complex } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

const makeComplex = (overrides: Partial<Complex> = {}): Complex => ({
  complex_no: "123",
  complex_name: "테스트단지",
  cortar_address: "서울시 강남구",
  total_household_count: 500,
  total_dong_count: 5,
  high_floor: 20,
  use_approve_ymd: "20200101",
  real_estate_type_name: "아파트",
  article_count: 10,
  ...overrides,
} as Complex);

function renderRow(props: Partial<React.ComponentProps<typeof ComplexRow>> = {}) {
  return render(
    <TestQueryProvider>
      <table>
        <tbody>
          <ComplexRow complex={makeComplex()} index={1} {...props} />
        </tbody>
      </table>
    </TestQueryProvider>,
  );
}

describe("ComplexRow 컴포넌트", () => {
  /** 정상 케이스: 기본 렌더링 */
  it("단지명·주소·매물수를 표시한다", () => {
    renderRow();
    expect(screen.getByText("테스트단지")).toBeInTheDocument();
    expect(screen.getByText("서울시 강남구")).toBeInTheDocument();
    expect(screen.getByText("10건")).toBeInTheDocument();
  });

  /** 터치타겟 회귀 가드 — 비교 버튼이 WCAG 44px 최소 터치타겟을 만족해야 한다 (개선플랜 P1-1) */
  it("비교 버튼이 44px 최소 터치타겟 클래스를 가진다", () => {
    renderRow();
    const button = screen.getByRole("button", { name: /비교 추가/ });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
  });

  /** 비교 상태(가득참)에서도 버튼이 비활성만 될 뿐 크기는 유지 */
  it("비교 목록이 가득 차면 버튼이 비활성화되지만 터치타겟 크기는 유지한다", () => {
    renderRow({ compareFull: true });
    const button = screen.getByRole("button", { name: /가득 참/ });
    expect(button).toBeDisabled();
    expect(button.className).toContain("min-h-11");
  });

  /** 세션 481 공개 전환: 비로그인 검색 응답엔 매물 수 칸이 없다 — "0건" 이 아니라 빈 칸 */
  it("비로그인(매물 수 칸 없음)이면 '0건' 대신 '-'", () => {
    renderRow({ complex: makeComplex({ article_count: undefined, trade_type_counts: undefined }) });
    expect(screen.queryByText(/건$/)).not.toBeInTheDocument();
    expect(screen.getByText("테스트단지")).toBeInTheDocument();
  });

  it("단지명 글자만 진짜 링크(행 전체 감싸기 금지) — <tr> 안 <a> 는 이름 칸 하나뿐 (세션 483 PR 3b)", () => {
    const { container } = renderRow();
    const link = screen.getByRole("link", { name: "테스트단지" });
    expect(link).toHaveAttribute("href", "/complex/123");
    const anchors = container.querySelectorAll("tr a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].closest("td")?.textContent).toBe("테스트단지");
    expect(container.querySelector("a tr, a td")).toBeNull();
  });

  it("로그인(매물 수 0)이면 지금처럼 '0건'", () => {
    renderRow({ complex: makeComplex({ article_count: 0 }) });
    expect(screen.getByText("0건")).toBeInTheDocument();
  });
});
