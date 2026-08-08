import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MbOfficetelRentalTable from "@/components/mb/MbOfficetelRentalTable";
import type { MbOfficetelRentalItem } from "@/types";

describe("MbOfficetelRentalTable", () => {
  it("오피스텔·민간임대 뱃지를 구분해서 표시한다", () => {
    const items: MbOfficetelRentalItem[] = [
      { kind: "officetel", house_manage_no: "1", apartment_id: "ah-1", recruit_date: "2026-08-01" },
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

  it("오피스텔 이름은 apartment_name(단지명)을 apartment_id 보다 우선 표시한다 (리뷰 결함 수정 회귀)", () => {
    const items: MbOfficetelRentalItem[] = [
      {
        kind: "officetel",
        house_manage_no: "1",
        apartment_id: "ah-1",
        apartment_name: "테스트오피스텔",
        recruit_date: "2026-08-01",
      },
    ];
    render(<MbOfficetelRentalTable items={items} />);

    expect(screen.getByText("테스트오피스텔")).toBeInTheDocument();
    expect(screen.queryByText("ah-1")).not.toBeInTheDocument();
  });

  it("apartment_name 이 없으면(로스터 미매칭 예외) apartment_id 로 폴백한다", () => {
    const items: MbOfficetelRentalItem[] = [
      { kind: "officetel", house_manage_no: "1", apartment_id: "ah-missing", recruit_date: "2026-08-01" },
    ];
    render(<MbOfficetelRentalTable items={items} />);

    expect(screen.getByText("ah-missing")).toBeInTheDocument();
  });
});
