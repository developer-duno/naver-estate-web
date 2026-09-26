import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PresaleSection } from "@/components/mb/MbDetailSections";
import type { MbApartment, MbPrice } from "@/types";

// 테스트 데이터 팩토리 — 필요한 필드만 덮어쓴다
function makePrice(overrides: Partial<MbPrice> = {}): MbPrice {
  return {
    id: 1,
    apartment_id: "apt-1",
    area: 84.8,
    supply_area: 114.6,
    price: 72000,
    pp: 2100,
    house_type: "84A",
    supply_count: 240,
    ...overrides,
  };
}

function makeApartment(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "apt-1",
    name: "테스트단지",
    region: "경기도",
    ...overrides,
  };
}

describe("PresaleSection 분양가 표", () => {
  // 390px 휴대폰에서 열 6개 표가 컨테이너 폭에 눌려 머리글("공급면적")이 세로로 한 글자씩
  // 꺾이던 결함의 회귀 가드. 표에 최소 너비가 있어야 부모 div(overflow-x-auto)가 가로 스크롤한다.
  it("표에 최소 너비(min-w-[Npx]·min-w-<숫자>) 가 있고 부모가 가로 스크롤 컨테이너다", () => {
    render(
      <PresaleSection
        apartment={makeApartment({ prices: [makePrice(), makePrice({ id: 2, house_type: "59A" })] })}
      />,
    );

    const table = screen.getByRole("table");
    expect(table.className).toMatch(/(^|\s)min-w-(?:\[\d+px\]|[1-9]\d*(?:\.5)?)(\s|$)/);
    expect(table.parentElement?.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    // 머리글 6개가 모두 렌더된다(모바일에서도 숨기는 열이 없는 표라 최소 너비가 필요한 것)
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });

  it("분양가 데이터가 없으면 표 대신 안내 문구를 보여 준다", () => {
    render(<PresaleSection apartment={makeApartment({ prices: [] })} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("분양가 데이터가 없습니다.")).toBeInTheDocument();
  });
});
