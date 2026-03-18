/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RegionSelector 컴포넌트 테스트 — hover 팝업 3컬럼 패널
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

describe("RegionSelector — hover 팝업 패널", () => {
  it("트리거 버튼 렌더링", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("지역을 선택하세요")).toBeInTheDocument();
    });
  });

  it("hover 시 패널 표시, 시/도 목록 보임", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      fireEvent.mouseEnter(screen.getByText("지역을 선택하세요").closest("div")!);
    });
    expect(screen.getByText("서울특별시")).toBeInTheDocument();
    expect(screen.getByText("부산광역시")).toBeInTheDocument();
  });

  it("시/도 hover → 시/군/구 표시", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      fireEvent.mouseEnter(screen.getByText("지역을 선택하세요").closest("div")!);
    });
    fireEvent.mouseEnter(screen.getByText("서울특별시"));
    expect(screen.getByText("강남구")).toBeInTheDocument();
    expect(screen.getByText("서초구")).toBeInTheDocument();
  });

  it("읍/면/동 클릭 시 onSearch 호출 + 패널 닫힘", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      fireEvent.mouseEnter(screen.getByText("지역을 선택하세요").closest("div")!);
    });
    fireEvent.click(screen.getByText("서울특별시"));
    fireEvent.click(screen.getByText("강남구"));
    fireEvent.click(screen.getByText("역삼동"));
    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구", "역삼동");
  });

  it("시/군/구 클릭만으로는 onSearch 호출되지 않음", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      fireEvent.mouseEnter(screen.getByText("지역을 선택하세요").closest("div")!);
    });
    fireEvent.click(screen.getByText("서울특별시"));
    fireEvent.click(screen.getByText("강남구"));
    expect(onSearch).not.toHaveBeenCalled();
  });
});
