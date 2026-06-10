/**
 * /tools/acquisition-tax 페이지 통합 테스트
 * 실행: npx vitest run src/app/__tests__/acquisition-tax.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import AcquisitionTaxToolPage from "../tools/acquisition-tax/page";

// CopyButton 이 쓰는 sonner 토스트 모킹 (Toaster 미마운트)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("/tools/acquisition-tax 페이지", () => {
  it("Hero 제목과 면책 안내가 렌더된다", () => {
    const { container } = render(<AcquisitionTaxToolPage />);
    expect(screen.getByRole("heading", { name: "취득세 계산기", level: 1 })).toBeInTheDocument();
    expect(container.textContent).toMatch(/지방세법 \+ 농특세법/);
    expect(container.textContent).toMatch(/위택스/);
  });

  it("매물유형 select + 6 입력 필드 + 일시적 2주택 안내가 렌더된다", () => {
    render(<AcquisitionTaxToolPage />);
    expect(screen.getByLabelText("매물 유형")).toBeInTheDocument();
    expect(screen.getByLabelText("매매가 (만원)")).toBeInTheDocument();
    expect(screen.getByLabelText("전용면적 (m²)")).toBeInTheDocument();
    expect(screen.getAllByText(/일시적 2주택/).length).toBeGreaterThan(0);
    expect(screen.getByText(/조정대상지역/)).toBeInTheDocument();
    expect(screen.getByText(/무주택 생애최초/)).toBeInTheDocument();
  });

  it("초기 상태 — 결과 카드가 회색 placeholder 표시", () => {
    render(<AcquisitionTaxToolPage />);
    expect(screen.getByText("매매가를 입력하면 결과가 표시됩니다.")).toBeInTheDocument();
  });

  it("5억 1주택 84m² 입력 → 합계 550만원 + 면책 안내 노출", () => {
    render(<AcquisitionTaxToolPage />);
    const amount = screen.getByLabelText("매매가 (만원)") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "50000" } });
    const result = screen.getByRole("status");
    expect(within(result).getByText("합계")).toBeInTheDocument();
    expect(within(result).getAllByText(/550만원/).length).toBeGreaterThan(0);
    expect(within(result).getByText("면책 안내")).toBeInTheDocument();
  });

  it("85m² 이하 1주택 → 농특세 비과세 안내 노출", () => {
    render(<AcquisitionTaxToolPage />);
    fireEvent.change(screen.getByLabelText("매매가 (만원)"), { target: { value: "50000" } });
    const result = screen.getByRole("status");
    expect(within(result).getByText("85m² 비과세")).toBeInTheDocument();
  });

  it("다주택 라디오 선택 시 조정대상지역 체크 활성화", () => {
    render(<AcquisitionTaxToolPage />);
    const regulatedCheckbox = screen.getByRole("checkbox", { name: /조정대상지역/ }) as HTMLInputElement;
    expect(regulatedCheckbox.disabled).toBe(true); // 1주택 시 비활성
    fireEvent.click(screen.getByLabelText("2주택"));
    expect(regulatedCheckbox.disabled).toBe(false);
  });

  it("12억 초과 매매가 + 생애최초 시도 → first-time-rejected 안내", () => {
    render(<AcquisitionTaxToolPage />);
    fireEvent.change(screen.getByLabelText("매매가 (만원)"), { target: { value: "130000" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /무주택 생애최초/ }));
    const result = screen.getByRole("status");
    // 12억 초과는 firstTimeDisabledReason으로 isFirstTime=false 강제, 표준세율 계산
    // 안내 사유 텍스트 노출
    expect(screen.getByText(/12억 초과 매물은 생애최초 감면 대상이 아닙니다/)).toBeInTheDocument();
    expect(result).toBeInTheDocument();
  });

  it("오피스텔 선택 → 생애최초 비활성 + 사유 노출", () => {
    render(<AcquisitionTaxToolPage />);
    const select = screen.getByLabelText("매물 유형") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "officetel-commercial" } });
    expect(screen.getByText(/오피스텔·상가는 생애최초 감면 대상이 아닙니다/)).toBeInTheDocument();
    const firstTime = screen.getByRole("checkbox", { name: /무주택 생애최초/ }) as HTMLInputElement;
    expect(firstTime.disabled).toBe(true);
  });

  /** 생애최초 비활성 시 사유 p 를 aria-describedby 로 연결 (스크린리더가 비활성 이유 공지) — 세션 287 */
  it("생애최초 비활성 시 aria-describedby 가 사유 p 와 연결, 활성 시 미연결", () => {
    render(<AcquisitionTaxToolPage />);
    const firstTime = screen.getByRole("checkbox", { name: /무주택 생애최초/ });
    // 초기(1주택 house) 상태: 활성 → describedby 없음
    expect(firstTime).not.toHaveAttribute("aria-describedby");
    // 오피스텔 선택 → 비활성 + describedby 가 사유 p 의 id 를 가리킴
    fireEvent.change(screen.getByLabelText("매물 유형"), { target: { value: "officetel-commercial" } });
    expect(firstTime).toHaveAttribute("aria-describedby", "first-time-disabled-reason");
    const reason = document.getElementById("first-time-disabled-reason");
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toMatch(/오피스텔·상가는 생애최초 감면 대상이 아닙니다/);
  });

  /** 초기화 버튼 — 입력값을 마운트 초기값으로 복원 (areaM2=84, houses=1, propertyType='house', '전부 0' 금지) */
  it("초기화 버튼 — 매매가·면적·매물유형이 마운트 초기값으로 복귀", () => {
    render(<AcquisitionTaxToolPage />);
    const amount = screen.getByLabelText("매매가 (만원)") as HTMLInputElement;
    const area = screen.getByLabelText("전용면적 (m²)") as HTMLInputElement;
    const propType = screen.getByLabelText("매물 유형") as HTMLSelectElement;
    // 값 변경
    fireEvent.change(amount, { target: { value: "130000" } });
    fireEvent.change(area, { target: { value: "120" } });
    fireEvent.change(propType, { target: { value: "officetel-commercial" } });
    fireEvent.click(screen.getByLabelText("2주택"));
    expect(amount.value).toBe("130000");
    // 초기화
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    // 마운트 초기값 복귀: 매매가 빈값 → placeholder 안내 / 면적 84 (0 아님) / 매물유형 house
    expect(screen.getByText("매매가를 입력하면 결과가 표시됩니다.")).toBeInTheDocument();
    expect((screen.getByLabelText("전용면적 (m²)") as HTMLInputElement).value).toBe("84");
    expect((screen.getByLabelText("매물 유형") as HTMLSelectElement).value).toBe("house");
  });

  /** 결과 복사 버튼 (세션 265) */
  it("결과 입력 후 복사 버튼 클릭 → 합계 + 참고용 면책 복사", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    render(<AcquisitionTaxToolPage />);
    fireEvent.change(screen.getByLabelText("매매가 (만원)"), { target: { value: "50000" } });

    fireEvent.click(screen.getByRole("button", { name: "취득세 결과 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("취득세 합계");
    // 면책 문구 누락 방지 가드 (사용자 명시 요구)
    expect(copied).toContain("참고용");
  });
});
