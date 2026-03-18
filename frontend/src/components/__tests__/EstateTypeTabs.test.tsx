/**
 * EstateTypeTabs 컴포넌트 테스트 — 매물유형 토글 버튼
 * 실행: npx vitest run src/components/__tests__/EstateTypeTabs.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EstateTypeTabs from "../EstateTypeTabs";
import { ESTATE_TYPE_TABS } from "@/lib/constants";

const allCodes = ESTATE_TYPE_TABS.map((t) => t.code);

/** 버튼 텍스트에서 정확히 매칭 (✓ 접두사 고려) */
function getTabButton(label: string) {
  const buttons = screen.getAllByRole("button");
  return buttons.find((btn) => btn.textContent === `✓${label}` || btn.textContent === label)!;
}

describe("EstateTypeTabs", () => {
  it("6개 탭 버튼 렌더링", () => {
    render(<EstateTypeTabs selected={[...allCodes]} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
  });

  it("선택된 탭에 체크마크(✓) 표시", () => {
    render(<EstateTypeTabs selected={["APT", "OPST"]} onChange={vi.fn()} />);
    expect(getTabButton("아파트").textContent).toContain("✓");
    expect(getTabButton("재건축").textContent).not.toContain("✓");
  });

  it("미선택 탭 클릭 → 추가", () => {
    const onChange = vi.fn();
    render(<EstateTypeTabs selected={["APT"]} onChange={onChange} />);
    fireEvent.click(getTabButton("오피스텔"));
    expect(onChange).toHaveBeenCalledWith(["APT", "OPST"]);
  });

  it("선택된 탭 클릭 → 제거", () => {
    const onChange = vi.fn();
    render(<EstateTypeTabs selected={["APT", "OPST"]} onChange={onChange} />);
    fireEvent.click(getTabButton("오피스텔"));
    expect(onChange).toHaveBeenCalledWith(["APT"]);
  });

  it("마지막 1개 탭은 해제 불가 (최소 1개 보장)", () => {
    const onChange = vi.fn();
    render(<EstateTypeTabs selected={["APT"]} onChange={onChange} />);
    fireEvent.click(getTabButton("아파트"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
