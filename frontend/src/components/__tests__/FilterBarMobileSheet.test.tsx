/**
 * FilterBarMobileSheet — 모바일 바텀시트 필터 테스트
 * 실행: npx vitest run src/components/__tests__/FilterBarMobileSheet.test.tsx
 *
 * jsdom Radix Portal selector 패턴 답습 (Header.test.tsx:101) — render 컨테이너 밖
 * portal 에 그려지므로 document.querySelector 직접.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBarMobileSheet from "../FilterBarMobileSheet";

vi.mock("next/navigation", () => ({
  usePathname: () => "/complex/12345",
}));

describe("FilterBarMobileSheet — 모바일 바텀시트 필터", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const findDialog = () =>
    document.querySelector('[role="dialog"]') as HTMLElement | null;

  it("트리거 버튼 렌더 + aria-label '필터 창 열기' (활성 0 시)", () => {
    render(<FilterBarMobileSheet onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "필터 창 열기" });
    expect(trigger).toBeInTheDocument();
  });

  it("활성 0 시 배지 미표시", () => {
    render(<FilterBarMobileSheet onChange={vi.fn()} />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("초기 필터 활성 N 시 트리거 aria-label '활성 N개' + 배지 N 표시", () => {
    render(
      <FilterBarMobileSheet
        onChange={vi.fn()}
        initialFilters={{ trade_types: "매매", min_rooms: 2 }}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: /필터 창 열기 \(활성 2개\)/,
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toContain("2");
  });

  it("트리거 클릭 → Sheet 열림 (role=dialog 노출)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FilterBarMobileSheet onChange={vi.fn()} />);
    expect(findDialog()).toBeNull();
    await user.click(screen.getByRole("button", { name: "필터 창 열기" }));
    expect(findDialog()).not.toBeNull();
  });

  it("Sheet 안에 SheetTitle h3 '필터' + SheetDescription sr-only", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FilterBarMobileSheet onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "필터 창 열기" }));
    const heading = screen.getByRole("heading", { level: 3, name: "필터" });
    expect(heading).toBeInTheDocument();
    const desc = document.querySelector('[data-slot="sheet-description"]');
    expect(desc).not.toBeNull();
    expect(desc).toHaveClass("sr-only");
  });

  it("거래유형 '매매' 클릭 → onChange 즉시 호출 (immediate)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FilterBarMobileSheet onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "필터 창 열기" }));

    const dialog = findDialog()!;
    const mae = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "매매",
    ) as HTMLButtonElement;
    expect(mae).toBeDefined();
    await user.click(mae);
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ trade_types: "매매" });
  });

  it("minPrice 입력 → 300ms 디바운스 → '결과 보기' → flushDebounce 로 즉시 emit", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FilterBarMobileSheet onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "필터 창 열기" }));

    const dialog = findDialog()!;
    const minPriceInput = dialog.querySelector(
      'input[aria-label="최소 가격 (만원)"]',
    ) as HTMLInputElement;
    expect(minPriceInput).not.toBeNull();
    await user.type(minPriceInput, "30000");

    const beforeFlush = onChange.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "결과 보기" }));

    expect(onChange.mock.calls.length).toBeGreaterThan(beforeFlush);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ min_price: 30000 });
  });

  it("'초기화' 클릭 → onChange({}) 호출", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <FilterBarMobileSheet
        onChange={onChange}
        initialFilters={{ trade_types: "매매" }}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /필터 창 열기 \(활성 1개\)/ }),
    );

    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "초기화" }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("'결과 보기' 클릭 → Sheet 닫힘 (role=dialog 사라짐)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FilterBarMobileSheet onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "필터 창 열기" }));
    expect(findDialog()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "결과 보기" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(findDialog()).toBeNull();
  });
});
