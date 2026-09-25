/**
 * VerificationReview 컴포넌트 테스트 — 검증 심사 대기 목록 + 모달 2종 접근성
 * 실행: npx vitest run src/components/admin/__tests__/VerificationReview.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import VerificationReview from "../VerificationReview";
import type { AgentVerification } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminVerifications: vi.fn(),
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
}));

import { getAdminVerifications } from "@/lib/api";
const mockGet = vi.mocked(getAdminVerifications);

function renderReview(token = "test-token") {
  return render(
    <TestQueryProvider>
      <VerificationReview token={token} />
    </TestQueryProvider>,
  );
}

const fixture = (overrides: Partial<AgentVerification> = {}): AgentVerification => ({
  id: 1,
  user_id: "u1",
  email: "agent@example.com",
  business_number: "123-45-67890",
  representative_name: "홍길동",
  business_verified: true,
  license_verified: false,
  license_doc_url: "https://example.com/doc.pdf",
  verification_status: "pending",
  submitted_at: "2026-08-01T00:00:00Z",
  ...overrides,
});

const page = (items: AgentVerification[]) => ({ items, total: items.length, page: 1, page_size: 20 });

describe("VerificationReview 컴포넌트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 정상 케이스: 목록 렌더링 */
  it("대기 중인 검증 신청을 표시한다", async () => {
    mockGet.mockResolvedValueOnce(page([fixture()]));
    renderReview();
    await waitFor(() => expect(screen.getByText("agent@example.com")).toBeInTheDocument());
    expect(screen.getByText("홍길동")).toBeInTheDocument();
  });

  /** 에러/빈 데이터 케이스: 대기 신청 0건이면 카드 자체를 숨김(기존 동작 유지 확인) */
  it("대기 신청이 0건이면 아무것도 렌더링하지 않는다", async () => {
    mockGet.mockResolvedValueOnce(page([]));
    const { container } = renderReview();
    // isLoading 스켈레톤이 사라지고 data 반영까지 기다린다 (mockGet 호출 시점만으론 로딩중 DOM을 잡음)
    await waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
    expect(container.firstChild).toBeNull();
  });

  /** 접근성 회귀 가드 — 자격증 미리보기 모달 (개선플랜 P1-3) */
  it("자격증 서류 보기 모달이 dialog role·aria-modal을 가지고 ESC로 닫힌다", async () => {
    mockGet.mockResolvedValueOnce(page([fixture()]));
    renderReview();
    await waitFor(() => expect(screen.getByText("agent@example.com")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "보기" }));
    const dialog = screen.getByRole("dialog", { name: "자격증 서류" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "자격증 서류" })).not.toBeInTheDocument());
  });

  /** 접근성 회귀 가드 — 거부 사유 모달 (개선플랜 P1-3) */
  it("거부 사유 모달이 dialog role·aria-modal을 가지고 ESC로 닫힌다", async () => {
    mockGet.mockResolvedValueOnce(page([fixture()]));
    renderReview();
    await waitFor(() => expect(screen.getByText("agent@example.com")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "거부" }));
    const dialog = screen.getByRole("dialog", { name: "거부 사유 입력" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "거부 사유 입력" })).not.toBeInTheDocument());
  });
});

describe("VerificationReview 우리말 문구 (관리자 화면 리뉴얼 A4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'국토부 미매칭' 은 풀어 쓴 문구로 보이고 원문은 title 에 남는다", async () => {
    mockGet.mockResolvedValue(page([fixture({ broker_verified: false, broker_status: "국토부 미매칭" })]));
    renderReview();
    const chip = await screen.findByText("국토부 중개사무소 목록에서 못 찾음");
    expect(chip).toHaveAttribute("title", "국토부 미매칭");
  });

  it("이미 우리말인 V-WORLD 상태명(예: 휴업)은 그대로, 값이 없으면 '미확인'", async () => {
    mockGet.mockResolvedValue(
      page([
        fixture({ id: 1, broker_verified: false, broker_status: "휴업" }),
        fixture({ id: 2, email: "b@example.com", broker_verified: false, broker_status: null }),
      ]),
    );
    renderReview();
    expect(await screen.findByText("휴업")).toBeInTheDocument();
    expect(screen.getByText("미확인")).toBeInTheDocument();
  });

  it("도움말(ⓘ)을 열면 승인은 바로 반영, 거부는 사유가 필요하다고 알린다", async () => {
    mockGet.mockResolvedValue(page([fixture()]));
    renderReview();
    await screen.findByText("agent@example.com");
    expect(screen.queryByText(/승인은 바로 반영돼요/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "설명 보기" }));
    expect(screen.getByText(/승인은 바로 반영돼요/)).toBeInTheDocument();
    expect(screen.getByText(/거부는 사유를 적어야/)).toBeInTheDocument();
  });
});
