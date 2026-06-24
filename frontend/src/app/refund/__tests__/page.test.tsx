/**
 * /refund 환불정책 페이지 회귀 가드
 * 결제버튼(PR4) 노출 전 전자상거래법·콘텐츠산업진흥법상 필수 고지가 존재하는지 검증.
 * 실행: npx vitest run src/app/refund/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RefundPage from "../page";

describe("/refund 환불정책", () => {
  it("핵심 환불 문구 노출 — '환불' 제목 + '청약철회'", () => {
    render(<RefundPage />);
    expect(
      screen.getByRole("heading", { name: "환불정책", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/청약철회/).length).toBeGreaterThan(0);
  });

  it("7일 이내 미사용 전액 환불 기준 명시", () => {
    render(<RefundPage />);
    expect(screen.getAllByText(/7일 이내/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/전액 환불/).length).toBeGreaterThan(0);
  });

  it("결제대행사(포트원) 고지 노출", () => {
    render(<RefundPage />);
    expect(screen.getAllByText(/포트원/).length).toBeGreaterThan(0);
  });

  it("전자상거래법 필수 사업자 정보 항목 노출 (통신판매업 신고번호 포함)", () => {
    render(<RefundPage />);
    expect(screen.getAllByText(/통신판매업 신고번호/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/사업자등록번호/).length).toBeGreaterThan(0);
  });
});
