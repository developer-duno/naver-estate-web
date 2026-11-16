/**
 * /terms 이용약관 — 제1·2·4조 개정 글(세션 513 PR 2a)
 * 실행: npx vitest run src/app/__tests__/terms.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// 유료 일시중지 안내는 이 시험의 관심 밖 — 잠금 상태와 무관하게 빈 칸으로
vi.mock("@/components/PaidServicePausedNotice", () => ({ default: () => null }));

import TermsPage, { metadata } from "../terms/page";

describe("/terms 이용약관", () => {
  it("옛 서비스 이름·신뢰도 변명 문구가 없다", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("네이버 부동산 매물 조회");
    expect(text).not.toContain("참고용");
    expect(text).not.toContain("정확하지 않을 수");
  });

  it("제4조 면책 — 「고의 또는 중대한 과실」 한 번 · 제2조 목록 4줄", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text.split("고의 또는 중대한 과실").length - 1).toBe(1);
    expect(text).toContain("공인중개사 실무에 쓰는 법령 근거, 서식 원문 연결, 체크 목록");
    expect(text).toContain("개별 거래에 대한 법률 자문이 아닙니다");
  });

  it("제1조~제8조 제목 순서 그대로 + 부칙", () => {
    render(<TermsPage />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      "제1조 (목적)",
      "제2조 (서비스 내용)",
      "제3조 (이용자의 의무)",
      "제4조 (면책)",
      "제5조 (유료 서비스 및 결제)",
      "제6조 (이용권 및 갱신)",
      "제7조 (청약철회 및 환불)",
      "제8조 (약관 변경)",
    ]);
    expect(screen.getByText(/부칙: 이 약관은 2026년 11월 16일 제1조·제2조·제4조를 고쳤습니다\./)).toBeInTheDocument();
  });

  it("메타 canonical /terms 그대로", () => {
    expect(metadata.alternates?.canonical).toBe("/terms");
  });
});
