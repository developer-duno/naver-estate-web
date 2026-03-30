/**
 * MbRegionSelector 컴포넌트 테스트 — 시도/시군구 선택, 검색 콜백
 * 실행: npx vitest run src/components/__tests__/MbRegionSelector.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MbRegionSelector from "../mb/MbRegionSelector";
import { TestQueryProvider } from "@/test-setup";

vi.mock("@/lib/api", () => ({
  getMbGuList: vi.fn().mockResolvedValue({ gu_list: ["수원시", "용인시"] }),
}));

function renderSelector(props: Partial<Parameters<typeof MbRegionSelector>[0]> = {}) {
  const onSearch = vi.fn();
  render(
    <TestQueryProvider>
      <MbRegionSelector onSearch={onSearch} {...props} />
    </TestQueryProvider>,
  );
  return { onSearch };
}

describe("MbRegionSelector 기본 렌더링", () => {
  it("시/도 셀렉터가 표시된다", () => {
    renderSelector();
    expect(screen.getByLabelText("시/도")).toBeInTheDocument();
  });

  it("시/군/구 셀렉터가 표시된다", () => {
    renderSelector();
    expect(screen.getByLabelText("시/군/구")).toBeInTheDocument();
  });

  it("검색 버튼이 표시된다", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "검색" })).toBeInTheDocument();
  });

  it("시도 미선택 시 검색 버튼이 비활성화된다", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "검색" })).toBeDisabled();
  });

  it("시도 미선택 시 시군구 셀렉터가 비활성화된다", () => {
    renderSelector();
    expect(screen.getByLabelText("시/군/구")).toBeDisabled();
  });
});

describe("MbRegionSelector 상호작용", () => {
  it("시도 선택 후 검색 버튼이 활성화된다", () => {
    renderSelector();
    fireEvent.change(screen.getByLabelText("시/도"), { target: { value: "경기" } });
    expect(screen.getByRole("button", { name: "검색" })).not.toBeDisabled();
  });

  it("검색 클릭 시 onSearch가 호출된다", () => {
    const { onSearch } = renderSelector();
    fireEvent.change(screen.getByLabelText("시/도"), { target: { value: "서울" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(onSearch).toHaveBeenCalledWith("서울", undefined, undefined);
  });

  it("시도 선택 시 시군구가 gu-list API로 표시된다", async () => {
    renderSelector();
    fireEvent.change(screen.getByLabelText("시/도"), { target: { value: "경기" } });
    await waitFor(() => {
      const guSelect = screen.getByLabelText("시/군/구");
      const options = guSelect.querySelectorAll("option");
      const guValues = Array.from(options).map((o) => o.textContent).filter((t) => t !== "전체");
      expect(guValues).toEqual(["수원시", "용인시"]);
    });
  });

  it("기본 시도가 전달되면 셀렉터에 반영된다", () => {
    renderSelector({ defaultRegion: "서울" });
    expect(screen.getByLabelText("시/도")).toHaveValue("서울");
  });
});
