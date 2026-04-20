/**
 * MaintenanceCost 정상 렌더 + 면적 매칭 테스트 (2 케이스)
 * 실행: npx vitest run src/components/__tests__/MaintenanceCost.render.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import MaintenanceCost from "../article/MaintenanceCost";
import { getPyeongDetails } from "@/lib/api";
import { makePyeongDetail } from "./MaintenanceCost.factory";

vi.mock("@/lib/api", () => ({
  getPyeongDetails: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MaintenanceCost - 정상 렌더", () => {
  it("정상 데이터 + area2M2 매칭 시 관리비 상세 렌더", async () => {
    vi.mocked(getPyeongDetails).mockResolvedValue({
      pyeong_details: [makePyeongDetail()],
    });
    render(<MaintenanceCost complexNo="C001" area2M2={84.9} />, {
      wrapper: TestQueryProvider,
    });
    await waitFor(() =>
      expect(screen.getByText(/관리비 상세/)).toBeInTheDocument(),
    );
    expect(screen.getByText("84.9㎡", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("15만원")).toBeInTheDocument();
    expect(screen.getByText("20만원")).toBeInTheDocument();
    expect(screen.getByText("25만원")).toBeInTheDocument();
    expect(screen.getByText("18만원")).toBeInTheDocument();
  });

  it("여러 평형 중 area2M2 와 가장 가까운 면적 선택", async () => {
    vi.mocked(getPyeongDetails).mockResolvedValue({
      pyeong_details: [
        makePyeongDetail({ pyeong_no: 1, exclusive_area: "59.8", avg_maintenance_cost: 10 }),
        makePyeongDetail({ pyeong_no: 2, exclusive_area: "84.9", avg_maintenance_cost: 15 }),
        makePyeongDetail({ pyeong_no: 3, exclusive_area: "114.3", avg_maintenance_cost: 22 }),
      ],
    });
    render(<MaintenanceCost complexNo="C001" area2M2={85} />, {
      wrapper: TestQueryProvider,
    });
    await waitFor(() =>
      expect(screen.getByText(/관리비 상세/)).toBeInTheDocument(),
    );
    // 85 ↔ 84.9 가 가장 가까움 → avg=15 선택
    expect(screen.getByText("84.9㎡", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("15만원")).toBeInTheDocument();
  });
});
