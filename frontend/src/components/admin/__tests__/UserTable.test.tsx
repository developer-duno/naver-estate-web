/**
 * UserTable 컴포넌트 테스트 — 사용자 목록 + 승인 기간 선택 모달 접근성
 * 실행: npx vitest run src/components/admin/__tests__/UserTable.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserTable from "../UserTable";
import type { UserProfile } from "@/types/admin";

const fixture = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  user_id: "u1",
  email: "user@example.com",
  role: "user",
  status: "pending",
  daily_crawl_quota: 10,
  daily_export_quota: 5,
  login_count: 3,
  created_at: "2026-08-01T00:00:00Z",
  ...overrides,
});

describe("UserTable 컴포넌트", () => {
  /** 정상 케이스: 목록 렌더링 */
  it("사용자 목록을 표시한다", () => {
    render(<UserTable users={[fixture()]} onUpdate={vi.fn()} />);
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  /** 상태를 승인으로 바꾸면 즉시 onUpdate 대신 승인기간 모달을 먼저 띄운다 */
  it("상태를 승인으로 변경하면 승인 기간 모달을 띄우고 onUpdate는 아직 호출하지 않는다", () => {
    const onUpdate = vi.fn();
    render(<UserTable users={[fixture()]} onUpdate={onUpdate} />);

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "approved" } });

    expect(screen.getByRole("dialog", { name: "승인 기간 선택" })).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  /** 접근성 회귀 가드 — 승인 기간 모달 (개선플랜 P1-3) */
  it("승인 기간 모달이 dialog role·aria-modal을 가지고 ESC로 닫히며 onUpdate를 호출하지 않는다", async () => {
    const onUpdate = vi.fn();
    render(<UserTable users={[fixture()]} onUpdate={onUpdate} />);

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "approved" } });
    const dialog = screen.getByRole("dialog", { name: "승인 기간 선택" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "승인 기간 선택" })).not.toBeInTheDocument());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  /** 승인 기간 선택 시 onUpdate가 approved_until과 함께 호출됨 */
  it("승인 기간을 선택하면 onUpdate가 approved 상태로 호출된다", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<UserTable users={[fixture()]} onUpdate={onUpdate} />);

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "approved" } });
    fireEvent.click(screen.getByText("1개월"));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("u1", expect.objectContaining({ status: "approved" })));
  });
});
