import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TransferNotices from "@/app/tools/transfer-tax/TransferNotices";

// 세션 531 B46 ①: 12억 초과 안분의 공제 표 갈래마다 안내가 하나씩만 뜨는지 검증한다.
// 옛 표2 안내의 「표2 보유+거주 합산 공제」 글이 표1·공제 없음 갈래에 같이 뜨면 틀린 말이 된다.
const TABLE2_PHRASE = "표2 보유+거주 합산 공제";
const TABLE1_PHRASE = "거주 2년 미만이라 표2 대신 표1 보유기간 공제 (연 2%, 최대 30%) 적용.";
const NONE_PHRASE = "보유 3년 미만이라 장기보유공제는 없음.";

describe("TransferNotices 12억 초과 안분 안내 (B46 ①)", () => {
  it("single-house-prorate-table1 → 표1 안내만 (표2 글 없음)", () => {
    render(<TransferNotices notes={["disclaimer", "single-house-prorate-table1"]} />);
    expect(screen.getByText("12억 초과 안분 적용")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(TABLE1_PHRASE.replace(/[()+%.]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TABLE2_PHRASE.replace(/\+/g, "\\+")))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(NONE_PHRASE.replace(/\./g, "\\.")))).not.toBeInTheDocument();
  });

  it("single-house-prorate-no-deduction → 공제 없음 안내만 (표2·표1 글 없음)", () => {
    render(<TransferNotices notes={["disclaimer", "single-house-prorate-no-deduction"]} />);
    expect(screen.getByText("12억 초과 안분 적용")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(NONE_PHRASE.replace(/\./g, "\\.")))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TABLE2_PHRASE.replace(/\+/g, "\\+")))).not.toBeInTheDocument();
    expect(screen.queryByText(/표2 대신 표1/)).not.toBeInTheDocument();
  });

  it("single-house-prorate (표2) → 기존 표2 안내 그대로 · 새 글 없음", () => {
    render(<TransferNotices notes={["disclaimer", "single-house-prorate"]} />);
    expect(screen.getByText("12억 초과 안분 적용")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(TABLE2_PHRASE.replace(/\+/g, "\\+")))).toBeInTheDocument();
    expect(screen.queryByText(/표2 대신 표1/)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(NONE_PHRASE.replace(/\./g, "\\.")))).not.toBeInTheDocument();
  });

  it("세 안내 모두 tone info (회색 상자)", () => {
    const { container } = render(
      <TransferNotices notes={["single-house-prorate", "single-house-prorate-table1", "single-house-prorate-no-deduction"]} />,
    );
    const boxes = container.querySelectorAll('[role="note"]');
    expect(boxes).toHaveLength(3);
    boxes.forEach((b) => expect(b.className).toContain("bg-gray-50"));
  });
});
