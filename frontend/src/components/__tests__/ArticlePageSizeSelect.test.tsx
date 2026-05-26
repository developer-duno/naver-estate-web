/**
 * ArticlePageSizeSelect — 한 페이지당 매물 개수 셀렉트 (10/20/30/50)
 * Radix Select 기반이라 jsdom 폴리필 (test-setup.ts hasPointerCapture·matchMedia·scrollIntoView) 의존.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ArticlePageSizeSelect from "../ArticlePageSizeSelect";

describe("ArticlePageSizeSelect", () => {
  it("초기 pageSize 값을 표시한다", () => {
    render(<ArticlePageSizeSelect pageSize={30} onPageSizeChange={() => {}} />);
    expect(screen.getByText("30개")).toBeInTheDocument();
    expect(screen.getByText("한 페이지당")).toBeInTheDocument();
  });

  it("옵션을 선택하면 onPageSizeChange 가 number 로 호출된다", async () => {
    const onPageSizeChange = vi.fn();
    const user = userEvent.setup();
    render(<ArticlePageSizeSelect pageSize={10} onPageSizeChange={onPageSizeChange} />);

    await user.click(screen.getByLabelText("한 페이지당 매물 개수"));
    await user.click(await screen.findByRole("option", { name: "30개" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(30);
    expect(typeof onPageSizeChange.mock.calls[0][0]).toBe("number");
  });

  it("4개 옵션 (10/20/30/50) 을 모두 렌더한다", async () => {
    const user = userEvent.setup();
    render(<ArticlePageSizeSelect pageSize={10} onPageSizeChange={() => {}} />);

    await user.click(screen.getByLabelText("한 페이지당 매물 개수"));

    expect(await screen.findByRole("option", { name: "10개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "20개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "30개" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50개" })).toBeInTheDocument();
  });
});
