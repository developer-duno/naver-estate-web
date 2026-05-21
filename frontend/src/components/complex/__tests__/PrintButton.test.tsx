/**
 * PrintButton 회귀 가드 — useReactToPrint 훅 호출 + .no-print 클래스 적용 검증
 * 실행: npx vitest run src/components/complex/__tests__/PrintButton.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import PrintButton from "../PrintButton";

const mockPrintHandler = vi.fn();

vi.mock("react-to-print", () => ({
  useReactToPrint: vi.fn(() => mockPrintHandler),
}));

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <PrintButton contentRef={ref} documentTitle="테스트" />
      <div ref={ref}>인쇄 영역</div>
    </div>
  );
}

describe("PrintButton", () => {
  it("렌더링 + 인쇄 버튼 노출", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /인쇄/ })).toBeInTheDocument();
  });

  it("클릭 시 useReactToPrint 핸들러 호출", async () => {
    mockPrintHandler.mockClear();
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /인쇄/ }));
    expect(mockPrintHandler).toHaveBeenCalled();
  });

  it(".no-print 클래스 적용 — 인쇄 시 자신을 숨김", () => {
    render(<Harness />);
    const btn = screen.getByRole("button", { name: /인쇄/ });
    expect(btn.className).toMatch(/no-print/);
  });
});
