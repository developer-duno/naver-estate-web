/**
 * 공인중개사 인증 페이지 테스트 — 폼 렌더링, 검증, 상태 표시
 * 실행: npx vitest run src/app/__tests__/verify.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import VerifyPage from "../(auth)/verify/page";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  submitVerification: vi.fn(),
  getVerificationStatus: vi.fn(),
  uploadLicenseDoc: vi.fn(),
}));
vi.mock("@/hooks/useAdminToken", () => ({
  useAdminToken: () => () => Promise.resolve("test-token"),
}));

import { submitVerification, getVerificationStatus } from "@/lib/api";
const mockGetStatus = vi.mocked(getVerificationStatus);
const mockSubmit = vi.mocked(submitVerification);

function renderPage() {
  return render(
    <TestQueryProvider>
      <VerifyPage />
    </TestQueryProvider>,
  );
}

describe("VerifyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 로딩 상태 — 스켈레톤 표시 */
  it("로딩 중 스켈레톤이 표시된다", () => {
    mockGetStatus.mockReturnValue(new Promise(() => {})); // 영원히 pending
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  /** 미제출 — 폼 렌더링 */
  it("미제출 시 입력 필드와 파일 업로드 영역, 제출 버튼이 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce({ submitted: false } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/사업자등록번호/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/대표자명/)).toBeInTheDocument();
    expect(screen.getByText(/공인중개사 자격증/)).toBeInTheDocument();
    expect(screen.getByText(/클릭 또는 드래그/)).toBeInTheDocument();
    expect(screen.getByLabelText(/중개사무소명/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /인증 신청/ })).toBeInTheDocument();
  });

  /** 클라이언트 검증 — 잘못된 사업자번호 */
  it("잘못된 사업자번호 입력 시 에러 메시지가 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce({ submitted: false } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/사업자등록번호/)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/사업자등록번호/), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText(/대표자명/), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByRole("button", { name: /인증 신청/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("10자리");
  });

  /** 자동 승인 결과 */
  it("자동 승인 시 인증 완료 메시지가 표시된다", async () => {
    // status는 항상 submitted:false 반환 (mutation.data가 result로 표시되도록)
    mockGetStatus.mockResolvedValue({ submitted: false } as never);
    mockSubmit.mockResolvedValueOnce({
      status: "approved",
      business_verified: true,
      business_message: "사업자등록 확인됨",
      auto_approved: true,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/사업자등록번호/)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/사업자등록번호/), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText(/대표자명/), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByRole("button", { name: /인증 신청/ }));

    await waitFor(() => {
      expect(screen.getByText("인증 완료")).toBeInTheDocument();
    });
    expect(screen.getByText("사업자등록 확인됨")).toBeInTheDocument();
  });

  /** pending 결과 */
  it("pending 시 신청 접수 메시지가 표시된다", async () => {
    mockGetStatus.mockResolvedValue({ submitted: false } as never);
    mockSubmit.mockResolvedValueOnce({
      status: "pending",
      business_verified: false,
      business_message: "유효하지 않은 사업자번호",
      auto_approved: false,
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/사업자등록번호/)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/사업자등록번호/), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText(/대표자명/), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByRole("button", { name: /인증 신청/ }));

    await waitFor(() => {
      expect(screen.getByText("신청 접수됨")).toBeInTheDocument();
    });
  });

  /** 거부 상태 — rejection_reason + 재신청 버튼 */
  it("거부 상태 시 거부 사유와 재신청 버튼이 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce({
      submitted: true,
      verification_status: "rejected",
      business_verified: false,
      rejection_reason: "서류 불충분",
    } as never);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("서류 불충분")).toBeInTheDocument();
    });
    expect(screen.getByText("거부됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /재신청/ })).toBeInTheDocument();
  });

  /** 에러 상태 — useQuery isError silent failure 정정 (세션 219 PR 답습)
   * 세션 217 ChartAccordion isError 패턴 답습. BE 다운/네트워크 오류 시
   * data=undefined 가 미제출 폼으로 그냥 표시되던 silent failure 차단. */
  it("상태 조회 실패 시 안내와 재시도 버튼이 표시된다", async () => {
    mockGetStatus.mockRejectedValueOnce(new Error("network error"));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/인증 상태를 불러오지 못했(?:어요|습니다)|상태를 가져오지/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeInTheDocument();
  });
});
