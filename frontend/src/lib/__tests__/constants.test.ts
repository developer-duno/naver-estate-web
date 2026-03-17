import { describe, it, expect } from "vitest";
import { M2_TO_PYEONG, PAGE_SIZE } from "../constants";

describe("constants", () => {
  it("M2_TO_PYEONG is correct conversion factor", () => {
    expect(M2_TO_PYEONG).toBeCloseTo(3.3058, 4);
  });

  it("33m2 is approximately 10 pyeong", () => {
    expect(33 / M2_TO_PYEONG).toBeCloseTo(9.98, 1);
  });

  it("PAGE_SIZE is reasonable", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(PAGE_SIZE).toBeLessThanOrEqual(100);
  });
});
