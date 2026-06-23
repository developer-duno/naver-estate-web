/**
 * MbMapToolbar 테스트 — 지도뷰 우측 인프라 레이어 토글 5종 (세션 318 신규, 세션 319 D 가드)
 * 실행: npx vitest run src/components/mb/__tests__/MbMapToolbar.test.tsx
 *
 * 검증: 5버튼 렌더 + 클릭 시 onChange(key) + 활성 재클릭 시 onChange(null)(해제) + aria-pressed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import MbMapToolbar from "../MbMapToolbar";

describe("MbMapToolbar", () => {
  it("5종 레이어 버튼(학군·교통·안전·대기질·어린이집)을 렌더한다", () => {
    render(<MbMapToolbar active={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /학군/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /교통/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /안전/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /대기질/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /어린이집/ })).toBeInTheDocument();
  });

  it("비활성 버튼 클릭 시 해당 키로 onChange 를 호출한다", () => {
    const onChange = vi.fn();
    render(<MbMapToolbar active={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /학군/ }));
    expect(onChange).toHaveBeenCalledWith("school");
  });

  it("활성 버튼 재클릭 시 onChange(null) 로 해제한다", () => {
    const onChange = vi.fn();
    render(<MbMapToolbar active="transit" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /교통/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("active 인 버튼만 aria-pressed=true 다", () => {
    render(<MbMapToolbar active="air" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /대기질/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /학군/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("툴바 컨테이너가 role=toolbar 다", () => {
    render(<MbMapToolbar active={null} onChange={vi.fn()} />);
    expect(screen.getByRole("toolbar", { name: /지도 정보 레이어/ })).toBeInTheDocument();
  });
});
