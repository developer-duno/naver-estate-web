/**
 * CompareFloatingBar 컴포넌트 테스트 — 비교 목록 플로팅 바
 * 실행: npx vitest run src/components/__tests__/CompareFloatingBar.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompareFloatingBar from "../CompareFloatingBar";
import type { CompareItem } from "@/hooks/useCompare";

/* next/navigation 모킹 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CompareFloatingBar 컴포넌트", () => {
  const onRemove = vi.fn();
  const onClear = vi.fn();

  const sampleList: CompareItem[] = [
    { complex_no: "C1", complex_name: "래미안" },
    { complex_no: "C2", complex_name: "힐스테이트" },
  ];

  /** 빈 목록이면 렌더링 안 함 */
  it("list가 비어있으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <CompareFloatingBar list={[]} onRemove={onRemove} onClear={onClear} />,
    );
    expect(container.firstChild).toBeNull();
  });

  /** 단지명 pill 표시 */
  it("비교 목록의 단지명이 pill로 표시된다", () => {
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.getByText("래미안")).toBeInTheDocument();
    expect(screen.getByText("힐스테이트")).toBeInTheDocument();
  });

  /** 비교 개수 표시 */
  it("비교 N/4 카운트가 표시된다", () => {
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.getByText("비교 2/4")).toBeInTheDocument();
  });

  /** 제거 버튼 동작 */
  it("x 버튼 클릭 시 onRemove가 호출된다", () => {
    const removeFn = vi.fn();
    render(
      <CompareFloatingBar list={sampleList} onRemove={removeFn} onClear={onClear} />,
    );

    const removeButtons = screen.getAllByText("x");
    fireEvent.click(removeButtons[0]);
    expect(removeFn).toHaveBeenCalledWith("C1");
  });

  /** 초기화 버튼 */
  it("초기화 버튼 클릭 시 onClear가 호출된다", () => {
    const clearFn = vi.fn();
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={clearFn} />,
    );

    fireEvent.click(screen.getByText("초기화"));
    expect(clearFn).toHaveBeenCalled();
  });

  /** 비교하기 버튼 — 2개 이상이면 활성 */
  it("2개 이상이면 비교하기 버튼이 활성화된다", () => {
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={onClear} />,
    );
    const btn = screen.getByText("비교하기");
    expect(btn).not.toBeDisabled();
  });

  /** 비교하기 버튼 — 1개면 비활성 */
  it("1개만 있으면 비교하기 버튼이 비활성화된다", () => {
    render(
      <CompareFloatingBar
        list={[{ complex_no: "C1", complex_name: "래미안" }]}
        onRemove={onRemove}
        onClear={onClear}
      />,
    );
    const btn = screen.getByText("비교하기");
    expect(btn).toBeDisabled();
  });

  /** 비교하기 클릭 → /compare?ids=... 이동 */
  it("비교하기 클릭 시 /compare 페이지로 이동한다", () => {
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={onClear} />,
    );

    fireEvent.click(screen.getByText("비교하기"));
    expect(pushMock).toHaveBeenCalledWith("/compare?ids=C1,C2");
  });

  /** 가득 참 배너 — 4개일 때만 표시 */
  it("비교 목록이 4개로 가득 차면 안내 배너가 표시된다", () => {
    const fullList: CompareItem[] = [
      { complex_no: "C1", complex_name: "래미안" },
      { complex_no: "C2", complex_name: "힐스테이트" },
      { complex_no: "C3", complex_name: "푸르지오" },
      { complex_no: "C4", complex_name: "자이" },
    ];
    render(
      <CompareFloatingBar list={fullList} onRemove={onRemove} onClear={onClear} />,
    );
    expect(
      screen.getByText(/비교 목록이 가득 찼습니다/),
    ).toBeInTheDocument();
  });

  /** 가득 참 배너 — 3개 이하면 미표시 */
  it("비교 목록이 3개 이하면 가득 참 배너가 표시되지 않는다", () => {
    render(
      <CompareFloatingBar list={sampleList} onRemove={onRemove} onClear={onClear} />,
    );
    expect(screen.queryByText(/비교 목록이 가득 찼습니다/)).toBeNull();
  });
});
