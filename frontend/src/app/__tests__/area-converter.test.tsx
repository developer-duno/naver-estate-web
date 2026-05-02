/**
 * /tools/area-converter 페이지 통합 테스트
 * 실행: npx vitest run src/app/__tests__/area-converter.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AreaConverterToolPage from "../tools/area-converter/page";

describe("/tools/area-converter 페이지", () => {
  it("Hero 제목·환산식 안내·면책 박스 렌더", () => {
    render(<AreaConverterToolPage />);
    expect(screen.getByText("평·㎡ 면적 변환 계산기")).toBeInTheDocument();
    expect(screen.getByText(/1평 = 3.3058㎡ 표준 환산식/)).toBeInTheDocument();
    expect(screen.getByText(/공부상 면적이나 등기부 면적과 차이/)).toBeInTheDocument();
  });

  it("두 입력 필드(㎡/평)와 빠른선택 4종씩 렌더", () => {
    render(<AreaConverterToolPage />);
    expect(screen.getByLabelText("제곱미터 입력")).toBeInTheDocument();
    expect(screen.getByLabelText("평 입력")).toBeInTheDocument();
    expect(screen.getByText("84㎡")).toBeInTheDocument();
    expect(screen.getByText("25평")).toBeInTheDocument();
  });

  it("㎡ 입력 → 평이 자동 계산 (84 → 25.4)", () => {
    render(<AreaConverterToolPage />);
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    fireEvent.change(m2, { target: { value: "84" } });
    expect(pyeong.value).toBe("25.4");
  });

  it("평 입력 → ㎡가 자동 계산 (25 → 83)", () => {
    render(<AreaConverterToolPage />);
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    fireEvent.change(pyeong, { target: { value: "25" } });
    // 25 × 3.3058 = 82.645 → round = 83
    expect(m2.value).toBe("83");
  });

  it("빠른선택 84㎡ 클릭 → ㎡=84, 평=25.4 동시 채움", () => {
    render(<AreaConverterToolPage />);
    fireEvent.click(screen.getByText("84㎡"));
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    expect(m2.value).toBe("84");
    expect(pyeong.value).toBe("25.4");
  });

  it("빠른선택 25평 클릭 → 평=25, ㎡=83 동시 채움", () => {
    render(<AreaConverterToolPage />);
    fireEvent.click(screen.getByText("25평"));
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    expect(pyeong.value).toBe("25");
    expect(m2.value).toBe("83");
  });

  it("입력 전에는 결과 카드 미표시, 입력 후 결과·초기화 노출", () => {
    render(<AreaConverterToolPage />);
    // 초기 상태: 환산식 안내 없음
    expect(screen.queryByText(/환산식: 1평 = 3.3058㎡/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("제곱미터 입력"), { target: { value: "100" } });
    expect(screen.getByText(/환산식: 1평 = 3.3058㎡/)).toBeInTheDocument();
    expect(screen.getByText("초기화")).toBeInTheDocument();
  });

  it("초기화 버튼 — 두 필드 모두 빈 값으로 복귀", () => {
    render(<AreaConverterToolPage />);
    fireEvent.change(screen.getByLabelText("제곱미터 입력"), { target: { value: "84" } });
    fireEvent.click(screen.getByText("초기화"));
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    expect(m2.value).toBe("");
    expect(pyeong.value).toBe("");
  });

  it("음수 입력은 그대로 보존 (convertArea 가드)", () => {
    render(<AreaConverterToolPage />);
    const m2 = screen.getByLabelText("제곱미터 입력") as HTMLInputElement;
    const pyeong = screen.getByLabelText("평 입력") as HTMLInputElement;
    fireEvent.change(m2, { target: { value: "-5" } });
    // convertArea 는 음수면 입력값 그대로 반환 → 두 필드 동일
    expect(pyeong.value).toBe("-5");
  });
});
