/**
 * VerifyProgress 회귀 가드 — currentStep 별 done/current/pending 분기 + aria-current
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerifyProgress } from "../VerifyProgress";

describe("VerifyProgress", () => {
  it("currentStep=signup → 첫 단계만 current, 나머지 pending", () => {
    render(<VerifyProgress currentStep="signup" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0].getAttribute("aria-current")).toBe("step");
    expect(items[1].getAttribute("aria-current")).toBeNull();
  });

  it("currentStep=license_submit → 3번째 current, 앞 2개 done", () => {
    render(<VerifyProgress currentStep="license_submit" />);
    const items = screen.getAllByRole("listitem");
    expect(items[2].getAttribute("aria-current")).toBe("step");
    // 앞 2개 done — text-accent-green 클래스 또는 done 표시
    expect(items[0].textContent).toContain("가입");
    expect(items[1].textContent).toContain("이메일 인증");
  });

  it("currentStep=admin_approve → 마지막 current", () => {
    render(<VerifyProgress currentStep="admin_approve" />);
    const items = screen.getAllByRole("listitem");
    expect(items[3].getAttribute("aria-current")).toBe("step");
    expect(items[3].textContent).toContain("관리자 승인");
  });

  it("aria-label 박힘 + 모든 step 라벨 표시", () => {
    render(<VerifyProgress currentStep="signup" />);
    expect(screen.getByLabelText("중개사 인증 진행 상태")).toBeInTheDocument();
    expect(screen.getByText("가입")).toBeInTheDocument();
    expect(screen.getByText("이메일 인증")).toBeInTheDocument();
    expect(screen.getByText("자격증 제출")).toBeInTheDocument();
    expect(screen.getByText("관리자 승인")).toBeInTheDocument();
  });
});
