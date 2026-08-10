import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MbOfficetelRentalTable from "@/components/mb/MbOfficetelRentalTable";
import type { MbOfficetelRentalItem } from "@/types";

describe("MbOfficetelRentalTable", () => {
  it("오피스텔·민간임대 뱃지를 구분해서 표시한다", () => {
    const items: MbOfficetelRentalItem[] = [
      { kind: "officetel", house_manage_no: "1", house_nm: "테스트오피스텔A", recruit_date: "2026-08-01" },
      { kind: "rental", house_manage_no: "2", house_nm: "임대주택B", recruit_date: "2026-08-02" },
    ];
    render(<MbOfficetelRentalTable items={items} />);

    expect(screen.getByText("오피스텔")).toBeInTheDocument();
    expect(screen.getByText("임대")).toBeInTheDocument();
    expect(screen.getByText("임대주택B")).toBeInTheDocument();
  });

  it("빈 목록이면 안내 문구를 표시한다", () => {
    render(<MbOfficetelRentalTable items={[]} />);
    expect(screen.getByText(/등록된.*없습니다/)).toBeInTheDocument();
  });

  it("오피스텔 이름은 house_nm(청약홈 단지명)을 표시한다 (V045 회귀 — house_nm NOT NULL)", () => {
    const items: MbOfficetelRentalItem[] = [
      {
        kind: "officetel",
        house_manage_no: "1",
        house_nm: "테스트오피스텔",
        recruit_date: "2026-08-01",
      },
    ];
    render(<MbOfficetelRentalTable items={items} />);

    expect(screen.getByText("테스트오피스텔")).toBeInTheDocument();
  });
});
