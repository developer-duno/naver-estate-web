/**
 * MaintenanceCost null 반환 분기 테스트 (3 케이스)
 * 실행: npx vitest run src/components/__tests__/MaintenanceCost.null.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

describe("MaintenanceCost - null 분기", () => {
  it("area2M2 미전달 시 null 반환", async () => {
    vi.mocked(getPyeongDetails).mockResolvedValue({
      pyeong_details: [makePyeongDetail()],
    });
    const { container } = render(<MaintenanceCost complexNo="C001" />, {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(getPyeongDetails).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("pyeong_details 빈 배열이면 null 반환", async () => {
    vi.mocked(getPyeongDetails).mockResolvedValue({ pyeong_details: [] });
    const { container } = render(
      <MaintenanceCost complexNo="C001" area2M2={84.9} />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getPyeongDetails).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("모든 관리비가 null/0 이면 null 반환", async () => {
    vi.mocked(getPyeongDetails).mockResolvedValue({
      pyeong_details: [
        makePyeongDetail({
          avg_maintenance_cost: 0,
          summer_maintenance_cost: undefined,
          winter_maintenance_cost: undefined,
          latest_maintenance_cost: 0,
        }),
      ],
    });
    const { container } = render(
      <MaintenanceCost complexNo="C001" area2M2={84.9} />,
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(getPyeongDetails).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
