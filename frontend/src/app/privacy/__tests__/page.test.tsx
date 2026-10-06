/**
 * /privacy 개인정보 처리방침 시험 (세션 439 보강)
 * 이 시험이 지키는 것: 시행일 · 보호책임자 이메일 · 국외 이전 표의 받는 자 5곳 ·
 * 화면 오류 자동 수집 고지 · 기존 결제·외부 대조 문단이 남아 있는지.
 * 실행: npx vitest run src/app/privacy/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PrivacyPage from "../page";

describe("/privacy 개인정보 처리방침", () => {
  it("맨 위에 시행일을 보인다", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("시행일: 2026년 10월 7일")).toBeInTheDocument();
  });

  it("보호책임자(2u부동산 운영팀)와 이메일 링크를 보인다", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("보호책임자: 2u부동산 운영팀")).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: "kyh11kyh@gmail.com" });
    expect(mail).toHaveAttribute("href", "mailto:kyh11kyh@gmail.com");
  });

  it("국외 이전 표에 받는 자 5곳이 모두 있다", () => {
    render(<PrivacyPage />);
    const table = screen.getByTestId("privacy-overseas-table");
    for (const name of [
      "Telegram Messenger Inc.",
      "Google LLC (Gmail)",
      "Vercel Inc.",
      "Cloudflare, Inc.",
      "Supabase Pte. Ltd.",
    ]) {
      expect(within(table).getByText(name)).toBeInTheDocument();
    }
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 5);
  });

  it("화면 오류 자동 수집과 그 보관 기간(1년)을 알린다", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/화면에서 오류가 나면 아래 정보를 자동으로 수집합니다/)).toBeInTheDocument();
    expect(screen.getByText("오류 이름·오류 문구")).toBeInTheDocument();
    expect(screen.getByText("화면 오류 기록은 처음 기록된 날부터 1년 보관한 뒤 삭제합니다.")).toBeInTheDocument();
  });

  it("기존 결제 위탁·외부 대조 문단과 변경 고지·개정 이력이 있다", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/포트원\(주식회사 코리아포트원\)/)).toBeInTheDocument();
    expect(screen.getByText(/국토교통부 V-WORLD/)).toBeInTheDocument();
    expect(screen.getByText(/국세청\(공공데이터포털\)/)).toBeInTheDocument();
    expect(screen.getByText("이 방침이 바뀌면 시행 7일 전부터 이 화면에 알립니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "개정 이력" })).toBeInTheDocument();
  });
});
