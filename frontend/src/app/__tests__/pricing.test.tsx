/**
 * /pricing 마케팅 페이지 테스트 — Hero/플랜 카드/CTA 링크/사회적 증명/데이터 출처
 * 실행: npx vitest run src/app/__tests__/pricing.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import PricingPage from "../pricing/page";

// PlanCards 의 CheckoutButton(useCheckout → useQueryClient) 때문에 QueryProvider 필수.
// supabase mock 이 session: null 이라 비로그인 → "무료 체험 시작" 링크 노출(기존 단언 유지).
function renderPage() {
  return render(
    <TestQueryProvider>
      <PricingPage />
    </TestQueryProvider>,
  );
}

describe("/pricing 마케팅 페이지", () => {
  it("Hero 제목과 7일 무료 체험 안내가 렌더된다", () => {
    const { container } = renderPage();
    expect(screen.getByText(/매물·시세 분석 도구/)).toBeInTheDocument();
    // "7일 무료 체험" 은 <strong> 으로 감싸져 있어 텍스트 노드가 분할됨 → 본문 전체에서 검색
    expect(container.textContent).toMatch(/7일 무료 체험/);
  });

  it("기본·프로 두 플랜 카드가 모두 표시된다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "기본", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "프로", level: 3 })).toBeInTheDocument();
    // PR 7a — "추후 공개" → "출시 시 공개" 변경, 두 카드 모두에 있음
    expect(screen.getAllByText(/출시 시 공개/).length).toBeGreaterThanOrEqual(2);
    // "인기" 뱃지가 프로 카드에 있음
    expect(screen.getByText("인기")).toBeInTheDocument();
  });

  it("'무료 체험 시작' / '회원가입' CTA 가 모두 /signup 으로 링크된다", () => {
    renderPage();
    const links = screen.getAllByRole("link");
    const signupLinks = links.filter((a) => a.getAttribute("href") === "/signup");
    // Hero CTA + 카드 3개(basic/pro/pro_365) + 푸터 CTA = 최소 5개
    expect(signupLinks.length).toBeGreaterThanOrEqual(5);
    // "무료 체험 시작" 텍스트가 카드 버튼에 들어감 (PlanCards 통합 검증, 카드 3종)
    expect(screen.getAllByText("무료 체험 시작").length).toBe(3);
  });

  it("PR 7a — 사회적 증명 4 수치가 모두 렌더된다 (가짜 데이터 0)", () => {
    renderPage();
    // 실측 수치 4종 (SocialProof 컴포넌트 답습)
    expect(screen.getByText("6만+")).toBeInTheDocument();
    expect(screen.getByText("단지 데이터")).toBeInTheDocument();
    expect(screen.getByText("5종")).toBeInTheDocument();
    expect(screen.getByText("부동산 계산기")).toBeInTheDocument();
    expect(screen.getByText("26편")).toBeInTheDocument();
    expect(screen.getByText("전문 가이드")).toBeInTheDocument();
    expect(screen.getByText("6종")).toBeInTheDocument();
    expect(screen.getByText("공공 데이터")).toBeInTheDocument();
  });

  it("PR 7a — 데이터 출처 6 배지가 모두 렌더된다", () => {
    renderPage();
    // 6 출처 (DataSourceBadges 컴포넌트 답습)
    expect(screen.getByText("네이버 부동산")).toBeInTheDocument();
    expect(screen.getByText("국토교통부")).toBeInTheDocument();
    expect(screen.getByText("에어코리아")).toBeInTheDocument();
    expect(screen.getByText("NEMC")).toBeInTheDocument();
    expect(screen.getByText("CPMS")).toBeInTheDocument();
    expect(screen.getByText("경찰청")).toBeInTheDocument();
  });

  it("PR 7a — FAQ 7 항목 (데이터 출처 / 결제 보안 추가)", () => {
    renderPage();
    expect(screen.getByText(/공인중개사가 아니어도 가입할 수 있나요\?/)).toBeInTheDocument();
    expect(screen.getByText(/데이터 출처는 어디인가요\?/)).toBeInTheDocument();
    expect(screen.getByText(/결제·로그인 보안은 어떻게 되나요\?/)).toBeInTheDocument();
  });
});
