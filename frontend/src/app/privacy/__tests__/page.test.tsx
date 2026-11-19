/**
 * /privacy 개인정보 처리방침 시험 (세션 439 보강)
 * 이 시험이 지키는 것: 시행일 · 보호책임자 이메일 · 국외 이전 표의 받는 자 5곳 ·
 * 화면 오류 자동 수집 고지 · 기존 결제·외부 대조 문단이 남아 있는지 ·
 * 10절 중개 실무 체크 목록 · 개정 예고 문단 · 개정 이력 첫 줄(세션 513 PR 2b) · 계약 체크 목록(세입자·집주인, 세션 514).
 * 시행일 글자는 화면의 「시행일:」 줄에서 읽는다 — 메인이 합치는 날에 page.tsx 의 날짜 세 곳을 고쳐도 시험은 그대로 돈다.
 * 실행: npx vitest run src/app/privacy/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PrivacyPage from "../page";

describe("/privacy 개인정보 처리방침", () => {
  it("맨 위 시행일 2026년 11월 23일 그대로 · 시행일이 지나 개정 예고 문단은 없다(세션 528 — 11절 7일 예고 끝)", () => {
    render(<PrivacyPage />);
    const effective = screen.getByText(/^시행일: \d{4}년 \d{1,2}월 \d{1,2}일$/);
    expect(effective).toHaveTextContent("시행일: 2026년 11월 23일");
    expect(screen.queryByText(/개정 예고/)).toBeNull();
  });

  it("10절(쿠키와 브라우저 저장소) 목록 끝에 중개 실무 체크 목록(세션 513)", () => {
    render(<PrivacyPage />);
    const h10 = screen.getByRole("heading", { level: 2, name: "10. 쿠키와 브라우저 저장소" });
    // 10절 제목 다음부터 다음 제목 전까지의 글
    let text = "";
    for (let el = h10.nextElementSibling; el && el.tagName !== "H2"; el = el.nextElementSibling) text += el.textContent;
    expect(text).toContain(
      "화면 오류 보고 횟수, 중개 실무 체크 목록의 거래 묶음(거래 번호·거래 유형·계약일)과 체크 표시, 계약 체크 목록(세입자·집주인용 등 모든 목록)의 체크 표시.",
    );
  });

  it("개정 이력 첫 줄 = 시행일 날짜의 체크 목록 추가(예고일 함께 · 세션 513·514)", () => {
    render(<PrivacyPage />);
    const [, y, m, d] = screen.getByText(/^시행일: /).textContent!.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/)!;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const h = screen.getByRole("heading", { level: 2, name: "개정 이력" });
    const first = h.nextElementSibling?.querySelector("li");
    expect(first?.textContent).toMatch(
      new RegExp(`^${iso} — 브라우저 저장소에 중개 실무·계약 체크 목록 추가 \\(\\d{4}-\\d{2}-\\d{2} 예고\\)$`),
    );
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
