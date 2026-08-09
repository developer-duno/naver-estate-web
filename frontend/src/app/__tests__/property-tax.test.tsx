/**
 * /tools/property-tax 페이지 통합 테스트 — 초기화 버튼 회귀 가드 (세션 268)
 * PR-C: 공시가격 자동입력 picker 가 useQuery 를 쓰므로 TestQueryProvider 래퍼 필수
 * (실앱은 Providers.tsx 의 QueryClientProvider 아래에서 렌더된다).
 * 실행: npx vitest run src/app/__tests__/property-tax.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PropertyTaxToolPage from "../tools/property-tax/page";
import { TestQueryProvider } from "@/test-setup";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderPage = () =>
  render(
    <TestQueryProvider>
      <PropertyTaxToolPage />
    </TestQueryProvider>,
  );

describe("/tools/property-tax 페이지", () => {
  it("Hero 제목과 공시가격 입력이 렌더된다", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "보유세 계산기 (재산세 + 종부세)", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("공시가격 (만원)")).toBeInTheDocument();
  });

  /** 초기화 버튼 — 입력값을 마운트 초기값으로 복원 ('전부 0' 금지, 객체는 {}, union 은 ''/'none') */
  it("초기화 버튼 — 공시가격이 빈값으로 복귀하고 결과 placeholder 재노출", () => {
    renderPage();
    const published = screen.getByLabelText("공시가격 (만원)") as HTMLInputElement;
    fireEvent.change(published, { target: { value: "120000" } });
    expect(published.value).toBe("120000");
    // 입력 시 placeholder 안내 사라짐
    expect(screen.queryByText("공시가격을 입력하세요")).not.toBeInTheDocument();
    // 초기화
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    // 마운트 초기값 복귀: 공시가격 빈값(0) → placeholder 안내 재노출
    expect((screen.getByLabelText("공시가격 (만원)") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("공시가격을 입력하세요")).toBeInTheDocument();
  });
});
