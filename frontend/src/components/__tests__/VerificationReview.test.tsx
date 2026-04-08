/**
 * VerificationReview 컴포넌트 테스트 — 관리자 검증 심사
 * 실행: npx vitest run src/components/__tests__/VerificationReview.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import VerificationReview from "../admin/VerificationReview";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  getAdminVerifications: vi.fn(),
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
}));

import { getAdminVerifications, approveVerification, rejectVerification } from "@/lib/api";
const mockGetList = vi.mocked(getAdminVerifications);
const mockApprove = vi.mocked(approveVerification);
const mockReject = vi.mocked(rejectVerification);

const MOCK_ITEM = {
  id: 1,
  user_id: "u1",
  email: "test@example.com",
  business_number: "1234567890",
  representative_name: "홍길동",
  business_verified: false,
  license_verified: false,
  verification_status: "pending" as const,
  submitted_at: "2026-04-01T00:00:00Z",
};

function renderComponent() {
  return render(
    <TestQueryProvider>
      <VerificationReview token="test-token" />
    </TestQueryProvider>,
  );
}

describe("VerificationReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 로딩 상태 */
  it("로딩 중 pulse 애니메이션이 표시된다", () => {
    mockGetList.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  /** 빈 목록 — 렌더링 없음 */
  it("pending 목록이 비어있으면 아무것도 렌더링하지 않는다", async () => {
    mockGetList.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 } as never);
    const { container } = renderComponent();
    await waitFor(() => {
      expect(mockGetList).toHaveBeenCalled();
    });
    // 빈 목록이면 null 반환하므로 자식 없음
    await waitFor(() => {
      expect(container.querySelector("table")).not.toBeInTheDocument();
    });
  });

  /** pending 목록 렌더링 */
  it("pending 검증 목록이 올바르게 렌더링된다", async () => {
    mockGetList.mockResolvedValueOnce({ items: [MOCK_ITEM], total: 1, page: 1, page_size: 20 } as never);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.getByText("홍길동")).toBeInTheDocument();
    // 사업자 + 자격증 미확인 뱃지 2개
    expect(screen.getAllByText("미확인")).toHaveLength(2);
  });

  /** 승인 버튼 */
  it("승인 버튼 클릭 시 approveVerification이 호출된다", async () => {
    mockGetList.mockResolvedValueOnce({ items: [MOCK_ITEM], total: 1, page: 1, page_size: 20 } as never);
    mockApprove.mockResolvedValueOnce({ status: "approved" } as never);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("승인")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("승인"));
    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith("test-token", 1);
    });
  });

  /** 거부 플로우 — 모달 → 사유 → 호출 */
  it("거부 버튼 → 모달 → 사유 입력 → rejectVerification 호출", async () => {
    mockGetList.mockResolvedValueOnce({ items: [MOCK_ITEM], total: 1, page: 1, page_size: 20 } as never);
    mockReject.mockResolvedValueOnce({ status: "rejected" } as never);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("거부")).toBeInTheDocument();
    });

    // 거부 버튼 → 모달 표시
    fireEvent.click(screen.getByText("거부"));
    expect(screen.getByText("거부 사유 입력")).toBeInTheDocument();

    // 사유 입력 + 거부 확인
    fireEvent.change(screen.getByPlaceholderText("거부 사유를 입력해주세요"), { target: { value: "서류 불충분" } });
    // 모달 내부의 거부 버튼 (두 번째)
    const buttons = screen.getAllByText("거부");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith("test-token", 1, "서류 불충분");
    });
  });
});
