/**
 * MaintenanceCost 테스트용 PyeongDetail factory
 */
import type { PyeongDetail } from "@/types/estate";

export function makePyeongDetail(overrides?: Partial<PyeongDetail>): PyeongDetail {
  return {
    pyeong_no: 1,
    exclusive_area: "84.9",
    avg_maintenance_cost: 15,
    summer_maintenance_cost: 20,
    winter_maintenance_cost: 25,
    latest_maintenance_cost: 18,
    ...overrides,
  };
}
