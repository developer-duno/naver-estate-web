/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RegionSelector 컴포넌트 테스트 — @base-ui Combobox 3종 (PR 4 단계 4)
 * 실행: npx vitest run src/components/__tests__/RegionSelector.test.tsx
 *
 * PR 4 단계 3 답습: native <select> → @base-ui/react Combobox 전환.
 * - input aria-label 은 동일 ("시/도"·"시/군/구"·"읍/면/동")
 * - disabled 는 내부 state (loading / !sido / !sigungu) 로 input 에 전달
 * - 옵션 선택은 trigger 클릭 → portal [role="option"] 클릭 (Header.test.tsx:101 패턴 답습)
 * - onValueChange 콜백 = string | null (clear 시 null) — handler 가 "" 로 정규화
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "../../test-setup";

const mockRegions = {
  "서울특별시": {
    "강남구": ["역삼동", "삼성동"],
    "서초구": ["서초동"],
  },
  "부산광역시": {
    "해운대구": ["우동"],
  },
};

vi.mock("@/lib/api", () => ({
  getRegions: vi.fn().mockResolvedValue(mockRegions),
}));

let RegionSelector: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../RegionSelector");
  RegionSelector = mod.default;
});

describe("RegionSelector — @base-ui Combobox 3종", () => {
  it("시/도 input 렌더링 + aria-label 노출", async () => {
    render(<TestQueryProvider><RegionSelector onSearch={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      expect(screen.getByLabelText("시/도")).toBeInTheDocument();
    });
  });

  it("시/도 미선택 시 시/군/구 input 비활성화 (disabled)", async () => {
    render(<TestQueryProvider><RegionSelector onSearch={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      const sigunguInput = screen.getByLabelText("시/군/구") as HTMLInputElement;
      expect(sigunguInput.disabled).toBe(true);
    });
  });

  it("시/군/구 미선택 시 읍/면/동 input 비활성화 (disabled)", async () => {
    render(<TestQueryProvider><RegionSelector onSearch={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      const dongInput = screen.getByLabelText("읍/면/동") as HTMLInputElement;
      expect(dongInput.disabled).toBe(true);
    });
  });

  it("시→군→읍 선택 시 onSearch('서울특별시', '강남구', '역삼동') 호출", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<TestQueryProvider><RegionSelector onSearch={onSearch} /></TestQueryProvider>);
    await waitFor(() => {
      const sidoInput = screen.getByLabelText("시/도") as HTMLInputElement;
      expect(sidoInput.disabled).toBe(false);
    });

    // 시/도 선택: input 클릭 → 포커스 → portal option 선택
    const sidoInput = screen.getByLabelText("시/도");
    await user.click(sidoInput);
    await user.click(await screen.findByRole("option", { name: "서울특별시" }));

    // 시/군/구 선택
    const sigunguInput = screen.getByLabelText("시/군/구");
    await waitFor(() => expect((sigunguInput as HTMLInputElement).disabled).toBe(false));
    await user.click(sigunguInput);
    await user.click(await screen.findByRole("option", { name: "강남구" }));

    // 읍/면/동 선택 → onSearch 자동 호출
    const dongInput = screen.getByLabelText("읍/면/동");
    await waitFor(() => expect((dongInput as HTMLInputElement).disabled).toBe(false));
    await user.click(dongInput);
    await user.click(await screen.findByRole("option", { name: "역삼동" }));

    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구", "역삼동");
  });

  it("시/군/구만 선택하면 onSearch 호출되지 않음 (동 선택 필요)", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<TestQueryProvider><RegionSelector onSearch={onSearch} /></TestQueryProvider>);
    await waitFor(() => {
      const sidoInput = screen.getByLabelText("시/도") as HTMLInputElement;
      expect(sidoInput.disabled).toBe(false);
    });

    await user.click(screen.getByLabelText("시/도"));
    await user.click(await screen.findByRole("option", { name: "서울특별시" }));

    const sigunguInput = screen.getByLabelText("시/군/구");
    await waitFor(() => expect((sigunguInput as HTMLInputElement).disabled).toBe(false));
    await user.click(sigunguInput);
    await user.click(await screen.findByRole("option", { name: "강남구" }));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("시/도 input 에 '강남' 타이핑 시 매칭 옵션 필터링 (Combobox 자동완성 핵심 가치)", async () => {
    const user = userEvent.setup();
    render(<TestQueryProvider><RegionSelector onSearch={vi.fn()} /></TestQueryProvider>);
    await waitFor(() => {
      const sidoInput = screen.getByLabelText("시/도") as HTMLInputElement;
      expect(sidoInput.disabled).toBe(false);
    });

    // 시/도 선택 후 시/군/구 input 활성화
    await user.click(screen.getByLabelText("시/도"));
    await user.click(await screen.findByRole("option", { name: "서울특별시" }));

    const sigunguInput = screen.getByLabelText("시/군/구") as HTMLInputElement;
    await waitFor(() => expect(sigunguInput.disabled).toBe(false));

    // "강남" 타이핑 → 매칭 옵션 노출
    await user.click(sigunguInput);
    await user.type(sigunguInput, "강남");

    expect(await screen.findByRole("option", { name: "강남구" })).toBeInTheDocument();
  });
});
