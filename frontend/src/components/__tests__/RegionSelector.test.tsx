/**
 * RegionSelector 컴포넌트 테스트 — 지역 3단계 선택, 검색 콜백
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
  // 모듈 캐시 리셋
  vi.resetModules();
  const mod = await import("../RegionSelector");
  RegionSelector = mod.default;
});

describe("RegionSelector — 추가", () => {
  it("동 드롭다운에 '전체' 기본 옵션", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const dongSelect = screen.getByLabelText("읍/면/동") as HTMLSelectElement;
      expect(dongSelect.options[0].text).toBe("전체");
    });
  });

  it("검색 버튼 텍스트", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      expect(screen.getByText("검색")).toBeInTheDocument();
    });
  });

  it("시도 선택 시 '선택' 기본 옵션 존재", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const sido = screen.getByLabelText("시/도") as HTMLSelectElement;
      expect(sido.options[0].text).toMatch(/선택|로딩/);
    });
  });

  it("시군구 기본 옵션 '선택'", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const sg = screen.getByLabelText("시/군/구") as HTMLSelectElement;
      expect(sg.options[0].text).toBe("선택");
    });
  });
});


describe("RegionSelector", () => {
  it("시도 드롭다운 렌더링", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      expect(screen.getByLabelText("시/도")).toBeInTheDocument();
    });
  });

  it("시도 선택 전 시군구 비활성화", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const sigungu = screen.getByLabelText("시/군/구") as HTMLSelectElement;
      expect(sigungu.disabled).toBe(true);
    });
  });

  it("시군구 선택 전 동 비활성화", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const dong = screen.getByLabelText("읍/면/동") as HTMLSelectElement;
      expect(dong.disabled).toBe(true);
    });
  });

  it("시도+시군구 미선택 시 검색 버튼 비활성화", async () => {
    const onSearch = vi.fn();
    render(<RegionSelector onSearch={onSearch} />);
    await waitFor(() => {
      const btn = screen.getByText("검색") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });
});
