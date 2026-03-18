/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RegionSelector 컴포넌트 테스트 — 네이버 스타일 3단계 선택, 검색 콜백
 * 실행: npx vitest run src/components/__tests__/RegionSelector.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// getRegions mock
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

// 모듈 레벨 캐시 초기화를 위해 dynamic import
let RegionSelector: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../RegionSelector");
  RegionSelector = mod.default;
});

describe("RegionSelector — 브레드크럼 네비게이션", () => {
  it("초기 상태에서 시/도 목록 표시", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("서울특별시")).toBeInTheDocument();
      expect(screen.getByText("부산광역시")).toBeInTheDocument();
    });
  });

  it("시/도 클릭 시 시/군/구 목록 표시", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText("서울특별시"));
    });
    expect(screen.getByText("강남구")).toBeInTheDocument();
    expect(screen.getByText("서초구")).toBeInTheDocument();
  });

  it("시/군/구 클릭 시 onSearch 즉시 호출 + 읍/면/동 표시", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText("서울특별시"));
    });
    fireEvent.click(screen.getByText("강남구"));
    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구");
    expect(screen.getByText("역삼동")).toBeInTheDocument();
    expect(screen.getByText("삼성동")).toBeInTheDocument();
  });

  it("읍/면/동 클릭 시 onSearch(sido, sigungu, dong) 호출", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText("서울특별시"));
    });
    fireEvent.click(screen.getByText("강남구"));
    fireEvent.click(screen.getByText("역삼동"));
    expect(onSearch).toHaveBeenCalledWith("서울특별시", "강남구", "역삼동");
  });

  it("브레드크럼 '시/도' 클릭 시 초기 상태로 복귀", async () => {
    render(<RegionSelector onSearch={vi.fn()} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText("서울특별시"));
    });
    fireEvent.click(screen.getByText("강남구"));
    // 브레드크럼의 '시/도' 버튼 클릭
    const breadcrumbs = screen.getAllByText("시/도");
    fireEvent.click(breadcrumbs[0]);
    expect(screen.getByText("서울특별시")).toBeInTheDocument();
    expect(screen.getByText("부산광역시")).toBeInTheDocument();
  });

  it("브레드크럼에서 시/도명 클릭 시 시/군/구로 복귀", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText("서울특별시"));
    });
    fireEvent.click(screen.getByText("강남구"));
    // 브레드크럼의 '서울특별시' 클릭
    const sidoButtons = screen.getAllByText("서울특별시");
    fireEvent.click(sidoButtons[0]);
    expect(screen.getByText("강남구")).toBeInTheDocument();
    expect(screen.getByText("서초구")).toBeInTheDocument();
  });
});
