/** EmptyState 컴포넌트 테스트 — icon/title/description/action 렌더링 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Scale } from "lucide-react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("title 만 있어도 렌더", () => {
    render(<EmptyState icon={Scale} title="비교할 단지가 없어요" />);
    expect(screen.getByText("비교할 단지가 없어요")).toBeInTheDocument();
  });

  it("description 있으면 보조 안내 표시", () => {
    render(
      <EmptyState
        icon={Scale}
        title="비교할 단지가 2개 이상 필요해요"
        description="검색 결과에서 선택해주세요."
      />,
    );
    expect(screen.getByText("검색 결과에서 선택해주세요.")).toBeInTheDocument();
  });

  it("action ReactNode 렌더 (버튼·링크 등)", () => {
    render(
      <EmptyState
        icon={Scale}
        title="비교할 단지가 없어요"
        action={<button type="button">돌아가기</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "돌아가기" })).toBeInTheDocument();
  });

  it("icon 에 aria-hidden 적용 (스크린리더에서 무시)", () => {
    const { container } = render(<EmptyState icon={Scale} title="없어요" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
