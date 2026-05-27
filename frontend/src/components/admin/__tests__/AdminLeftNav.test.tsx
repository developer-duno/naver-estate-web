/**
 * AdminLeftNav 회귀 가드 — 8 anchor + 2점 색신호 (freshness + health)
 * 실행: npx vitest run src/components/admin/__tests__/AdminLeftNav.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import AdminLeftNav from "../AdminLeftNav";
import type { DataFreshnessItem } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getDataFreshness: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn() }),
}));

import { getDataFreshness } from "@/lib/api";
const mockGet = vi.mocked(getDataFreshness);

const mkItem = (overrides: Partial<DataFreshnessItem>): DataFreshnessItem => ({
  key: "x",
  label: "x",
  count: 0,
  last_updated: null,
  expected_interval_seconds: 86400,
  status: "green",
  spinning: false,
  last_job: null,
  new_rows: null,
  ...overrides,
});

function renderNav() {
  return render(
    <TestQueryProvider>
      <AdminLeftNav />
    </TestQueryProvider>,
  );
}

describe("AdminLeftNav", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("8 anchor button 이 모두 렌더링된다", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkItem({ status: "green" })],
    });
    renderNav();
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "대시보드 카드 목차" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /건강도/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /이번 주 이슈/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /통계/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /스케줄러/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /데이터 신선도/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /네이버 호출/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /쿼터/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /실패 분류/ })).toBeInTheDocument();
  });

  it("freshness items 모두 green = 데이터 신선도 dot 도 green", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkItem({ key: "a", status: "green" }),
        mkItem({ key: "b", status: "green" }),
      ],
    });
    renderNav();
    await waitFor(() => {
      const freshnessBtn = screen.getByRole("button", { name: /데이터 신선도/ });
      const dot = freshnessBtn.querySelector("span[aria-hidden]");
      expect(dot?.className).toContain("bg-green-500");
    });
  });

  it("freshness items 중 red 1건 = 데이터 신선도 dot 빨강 + 건강도 dot 빨강", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkItem({ key: "a", status: "green" }),
        mkItem({ key: "b", status: "red" }),
      ],
    });
    renderNav();
    await waitFor(() => {
      const freshness = screen.getByRole("button", { name: /데이터 신선도/ });
      expect(freshness.querySelector("span[aria-hidden]")?.className).toContain("bg-red-500");
    });
    const health = screen.getByRole("button", { name: /건강도/ });
    expect(health.querySelector("span[aria-hidden]")?.className).toContain("bg-red-500");
  });

  it("spinning 1건 = 건강도 dot 빨강, 신선도 dot 은 status 기반 (green)", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkItem({ key: "a", status: "green", spinning: true }),
        mkItem({ key: "b", status: "green" }),
      ],
    });
    renderNav();
    await waitFor(() => {
      const health = screen.getByRole("button", { name: /건강도/ });
      expect(health.querySelector("span[aria-hidden]")?.className).toContain("bg-red-500");
    });
    const freshness = screen.getByRole("button", { name: /데이터 신선도/ });
    expect(freshness.querySelector("span[aria-hidden]")?.className).toContain("bg-green-500");
  });

  it("나머지 6 카드 (이번주이슈·통계·스케줄러·네이버·쿼터·실패) dot 는 unknown 회색", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkItem({ status: "red" })],
    });
    renderNav();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /이번 주 이슈/ })).toBeInTheDocument();
    });
    const labels = ["이번 주 이슈", "통계", "스케줄러", "네이버 호출", "쿼터", "실패 분류"];
    for (const label of labels) {
      const btn = screen.getByRole("button", { name: new RegExp(label) });
      expect(btn.querySelector("span[aria-hidden]")?.className).toContain("bg-gray-300");
    }
  });

  it("버튼 클릭 시 해당 id 의 scrollIntoView 호출", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkItem({ status: "green" })],
    });
    const target = document.createElement("div");
    target.id = "health";
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    renderNav();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /건강도/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /건강도/ }));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    document.body.removeChild(target);
  });

  it("freshness data undefined = 모든 dot 회색", async () => {
    mockGet.mockRejectedValueOnce(new Error("network"));
    renderNav();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /건강도/ })).toBeInTheDocument();
    });
    const health = screen.getByRole("button", { name: /건강도/ });
    const freshness = screen.getByRole("button", { name: /데이터 신선도/ });
    expect(health.querySelector("span[aria-hidden]")?.className).toContain("bg-gray-300");
    expect(freshness.querySelector("span[aria-hidden]")?.className).toContain("bg-gray-300");
  });
});
