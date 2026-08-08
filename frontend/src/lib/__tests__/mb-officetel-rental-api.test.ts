import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMbOfficetelRental } from "@/lib/api";

describe("getMbOfficetelRental", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 응답을 그대로 반환한다", async () => {
    const mockData = {
      items: [{ kind: "officetel", house_manage_no: "123", recruit_date: "2026-08-01" }],
      total: 1,
      page: 1,
      page_size: 50,
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await getMbOfficetelRental();
    expect(result.total).toBe(1);
    expect(result.items[0].kind).toBe("officetel");
  });

  it("5xx 에러는 reject 한다 (error-propagation.md — 삼킴 금지)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(getMbOfficetelRental()).rejects.toThrow();
  });
});
