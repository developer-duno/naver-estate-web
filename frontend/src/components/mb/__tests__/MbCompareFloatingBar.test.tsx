/**
 * MbCompareFloatingBar 컴포넌트 테스트
 * 실행: npx vitest run src/components/mb/__tests__/MbCompareFloatingBar.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbCompareFloatingBar from "../MbCompareFloatingBar";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("MbCompareFloatingBar", () => {
  /** 목록이 비어있으면 렌더링하지 않음 */
  it("비어있는 목록이면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <MbCompareFloatingBar list={[]} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  /** 항목 표시 */
  it("비교 목록의 단지명을 표시한다", () => {
    render(
      <MbCompareFloatingBar
        list={[{ id: "A1", name: "래미안" }, { id: "A2", name: "힐스테이트" }]}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("래미안")).toBeInTheDocument();
    expect(screen.getByText("힐스테이트")).toBeInTheDocument();
    expect(screen.getByText("비교 2/4")).toBeInTheDocument();
  });

  /** 2개 미만이면 비교하기 버튼 disabled */
  it("1개만 선택 시 비교하기 버튼이 비활성화된다", () => {
    render(
      <MbCompareFloatingBar list={[{ id: "A1", name: "래미안" }]} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText("비교하기")).toBeDisabled();
  });

  /** 비교하기 클릭 시 라우터 이동 */
  it("비교하기 클릭 시 /mibunyang/compare로 이동한다", () => {
    render(
      <MbCompareFloatingBar
        list={[{ id: "A1", name: "래미안" }, { id: "A2", name: "힐스테이트" }]}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("비교하기"));
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/compare?ids=A1,A2");
  });

  /** × 클릭 시 onRemove 호출 */
  it("× 버튼 클릭 시 onRemove가 해당 ID로 호출된다", () => {
    const onRemove = vi.fn();
    render(
      <MbCompareFloatingBar
        list={[{ id: "A1", name: "래미안" }]}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("래미안 제거"));
    expect(onRemove).toHaveBeenCalledWith("A1");
  });

  /** 초기화 클릭 시 onClear 호출 */
  it("초기화 버튼 클릭 시 onClear가 호출된다", () => {
    const onClear = vi.fn();
    render(
      <MbCompareFloatingBar
        list={[{ id: "A1", name: "래미안" }]}
        onRemove={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("초기화"));
    expect(onClear).toHaveBeenCalled();
  });
});
