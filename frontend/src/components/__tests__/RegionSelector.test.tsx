/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RegionSelector 컴포넌트 테스트 — 인라인 드롭다운 3개
 * 실행: npx vitest run src/components/__tests__/RegionSelector.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

describe("RegionSelector — 인라인 드롭다운", () => {
  it("시/도 드롭다운 렌더링", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("시/도")).toBeInTheDocument();
    });
  });

  it("시/도 선택 전 시/군/구 비활성화", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      expect((screen.getByLabelText("시/군/구") as HTMLSelectElement).disabled).toBe(true);
    });
  });

  it("시/군/구 선택 전 읍/면/동 비활성화", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      expect((screen.getByLabelText("읍/면/동") as HTMLSelectElement).disabled).toBe(true);
    });
  });

  it("시/도 → 시/군/구 → 읍/면/동 선택 시 onSearch 호출", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    // 데이터 로딩 대기
    await waitFor(() => expect((screen.getByLabelText("시/도") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("시/도"), { target: { value: "서울특별시" } });
    fireEvent.change(screen.getByLabelText("시/군/구"), { target: { value: "강남구" } });
    fireEvent.change(screen.getByLabelText("읍/면/동"), { target: { value: "역삼동" } });
    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구", "역삼동");
  });

  it("시/군/구 선택 시 onSearch 호출 (동 없이)", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => expect((screen.getByLabelText("시/도") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("시/도"), { target: { value: "서울특별시" } });
    fireEvent.change(screen.getByLabelText("시/군/구"), { target: { value: "강남구" } });
    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구");
  });
});
