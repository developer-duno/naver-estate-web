/**
 * UserTable 컴포넌트 테스트 — 사용자 목록 + 승인 기간 선택 모달 접근성
 * 실행: npx vitest run src/components/admin/__tests__/UserTable.test.tsx
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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

describe("UserTable 되돌리기 어려운 변경 확인창 (관리자 화면 리뉴얼 A4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function statusSelect() {
    return screen.getAllByRole("combobox")[1] as HTMLSelectElement;
  }
  function roleSelect() {
    return screen.getAllByRole("combobox")[0] as HTMLSelectElement;
  }

  it("정지로 바꾸려다 확인창에서 취소하면 onUpdate 를 안 부르고 선택값이 원래대로 돌아온다", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onUpdate = vi.fn();
    render(<UserTable users={[fixture({ status: "approved" })]} onUpdate={onUpdate} />);

    fireEvent.change(statusSelect(), { target: { value: "suspended" } });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // 누구를, 무엇이 바뀌는지 한 줄
    expect(confirmSpy.mock.calls[0][0]).toMatch(/user@example.com님을 정지하면/);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(statusSelect().value).toBe("approved");
  });

  it("정지를 확인하면 onUpdate 가 suspended 로 불린다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<UserTable users={[fixture({ status: "approved" })]} onUpdate={onUpdate} />);

    fireEvent.change(statusSelect(), { target: { value: "suspended" } });

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("u1", { status: "suspended" }));
  });

  it("거부로 바꿀 때도 확인창을 띄우고, 취소하면 값이 되돌아온다", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onUpdate = vi.fn();
    render(<UserTable users={[fixture({ status: "pending" })]} onUpdate={onUpdate} />);

    fireEvent.change(statusSelect(), { target: { value: "rejected" } });

    expect(confirmSpy.mock.calls[0][0]).toMatch(/거부하면/);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(statusSelect().value).toBe("pending");
  });

  it("관리자로 올리려다 취소하면 역할이 원래대로 돌아온다 (표시 이름이 있으면 그 이름으로 묻는다)", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onUpdate = vi.fn();
    render(<UserTable users={[fixture({ display_name: "김중개" })]} onUpdate={onUpdate} />);

    fireEvent.change(roleSelect(), { target: { value: "admin" } });

    expect(confirmSpy.mock.calls[0][0]).toMatch(/김중개님을 관리자로 올리면/);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(roleSelect().value).toBe("user");
  });

  it("위험하지 않은 변경(일반→전문가, 대기로 되돌리기)은 확인창 없이 바로 반영한다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<UserTable users={[fixture({ status: "approved" })]} onUpdate={onUpdate} />);

    fireEvent.change(roleSelect(), { target: { value: "expert" } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("u1", { role: "expert" }));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
