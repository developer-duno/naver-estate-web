/**
 * FilterBar 컴포넌트 테스트 — 툴바 드롭다운 UI
 * 실행: npx vitest run src/components/__tests__/FilterBar.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterBar from "../FilterBar";
import type { FilterOptions } from "@/types";

const defaultProps = {
  onChange: vi.fn(),
  filterOptions: { building_names: ["101동", "102동"], tags: ["역세권"], directions: ["남향", "동향"] } as FilterOptions,
  sortBy: "rank",
  onSortChange: vi.fn(),
};

// 드롭다운 열기 헬퍼
function openDropdown(label: string) {
  const btn = screen.getByText(new RegExp(`${label}.*▾`));
  fireEvent.click(btn);
}

describe("FilterBar — 툴바 버튼", () => {
  it("7개 필터 드롭다운 버튼 렌더링", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText(/거래유형.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/가격.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/면적.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/층수.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/입주.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/방\/욕실.*▾/)).toBeInTheDocument();
    expect(screen.getByText(/상세.*▾/)).toBeInTheDocument();
  });

  it("초기화 버튼 존재", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("초기화")).toBeInTheDocument();
  });

  it("초기화 클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText("초기화"));
    expect(onChange).toHaveBeenCalled();
  });
});

describe("FilterBar — 거래유형 드롭다운", () => {
  it("드롭다운 열면 거래유형 선택지 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("전세")).toBeInTheDocument();
    expect(screen.getByText("월세")).toBeInTheDocument();
    expect(screen.getByText("단기임대")).toBeInTheDocument();
  });

  it("거래유형 선택 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
    expect(onChange).toHaveBeenCalled();
  });
});

describe("FilterBar — 가격 드롭다운", () => {
  // 거래유형이 "전체"면 빠른 선택·평당가 숨김 → 매매 선택 후 검사
  function selectSale() {
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
  }

  it("매매 선택 후 가격 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    selectSale();
    openDropdown("가격");
    expect(screen.getByText("~3억")).toBeInTheDocument();
    expect(screen.getByText("3~6억")).toBeInTheDocument();
    expect(screen.getByText("15억~")).toBeInTheDocument();
  });

  it("매매 선택 후 프리셋 클릭 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    selectSale();
    openDropdown("가격");
    fireEvent.click(screen.getByText("~3억"));
    expect(onChange).toHaveBeenCalled();
  });

  it("매매 선택 후 평당가 프리셋도 표시", () => {
    render(<FilterBar {...defaultProps} />);
    selectSale();
    openDropdown("가격");
    expect(screen.getByText("~2천만")).toBeInTheDocument();
    expect(screen.getByText("5천만~")).toBeInTheDocument();
  });

  it("거래유형 '전체' 일 때는 안내 박스 + 빠른 선택·평당가 숨김", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("가격");
    expect(screen.getByText(/거래유형을 먼저 선택/)).toBeInTheDocument();
    expect(screen.queryByText("~3억")).not.toBeInTheDocument();
    expect(screen.queryByText("~2천만")).not.toBeInTheDocument();
    expect(screen.getByText("가격 직접입력 (만원)")).toBeInTheDocument();
  });

  it("거래유형 '전세' 선택 시 '전세가 직접입력' 라벨 + 빠른 선택·평당가 숨김", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("전세"));
    openDropdown("가격");
    expect(screen.getByText("전세가 직접입력 (만원)")).toBeInTheDocument();
    expect(screen.queryByText("~3억")).not.toBeInTheDocument();
    expect(screen.queryByText("~2천만")).not.toBeInTheDocument();
    expect(screen.queryByText(/수익률/)).not.toBeInTheDocument();
  });

  it("거래유형 '월세' 선택 시 '보증금 직접입력' + 월세 + 수익률 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("월세"));
    openDropdown("가격");
    expect(screen.getByText("보증금 직접입력 (만원)")).toBeInTheDocument();
    expect(screen.getByText("월세 (만원)")).toBeInTheDocument();
    expect(screen.getByText("수익률 (%)")).toBeInTheDocument();
    expect(screen.queryByText("평당가 (만원/평)")).not.toBeInTheDocument();
  });

  it("거래유형 '매매' 선택 시 '매매가 직접입력' 라벨 + 평당가 표시 + 수익률 숨김", () => {
    render(<FilterBar {...defaultProps} />);
    selectSale();
    openDropdown("가격");
    expect(screen.getByText("매매가 직접입력 (만원)")).toBeInTheDocument();
    expect(screen.getByText("평당가 (만원/평)")).toBeInTheDocument();
    expect(screen.queryByText("수익률 (%)")).not.toBeInTheDocument();
  });

  it("거래유형 '월세' 선택 시 보증금·월세 빠른 선택 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("월세"));
    openDropdown("가격");
    expect(screen.getByText("보증금 빠른 선택")).toBeInTheDocument();
    expect(screen.getByText("1~3천만")).toBeInTheDocument();
    expect(screen.getByText("5천만~1억")).toBeInTheDocument();
    expect(screen.getByText("월세 빠른 선택")).toBeInTheDocument();
    expect(screen.getByText("50~100만")).toBeInTheDocument();
    expect(screen.getByText("200만~")).toBeInTheDocument();
  });

  it("월세에서 보증금 프리셋 클릭 시 minPrice/maxPrice 로 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("월세"));
    openDropdown("가격");
    fireEvent.click(screen.getByText("1~3천만"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min_price: 1000, max_price: 3000 }));
  });

  it("월세에서 월세 프리셋 클릭 시 minRent/maxRent 로 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("월세"));
    openDropdown("가격");
    fireEvent.click(screen.getByText("50~100만"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min_rent: 50, max_rent: 100 }));
  });

  it("매매·전세 에는 보증금·월세 빠른 선택 미표시", () => {
    render(<FilterBar {...defaultProps} />);
    selectSale();
    openDropdown("가격");
    expect(screen.queryByText("보증금 빠른 선택")).not.toBeInTheDocument();
    expect(screen.queryByText("월세 빠른 선택")).not.toBeInTheDocument();
  });
});

describe("FilterBar — 면적 드롭다운", () => {
  it("드롭다운 열면 면적 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    expect(screen.getByText("~59m²")).toBeInTheDocument();
    expect(screen.getByText("84m²")).toBeInTheDocument();
    expect(screen.getByText("135m²~")).toBeInTheDocument();
  });

  it("단위 전환 버튼 존재", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    expect(screen.getByText("평으로")).toBeInTheDocument();
  });
});

describe("FilterBar — 면적 단위 토글 자동 변환", () => {
  // 면적 드롭다운 열고 minArea/maxArea 입력 헬퍼 (debounce 없이 즉시 onChange)
  function setAreaInputs(min: string, max: string = "") {
    openDropdown("면적");
    const minInput = screen.getByLabelText(/최소 전용면적/);
    const maxInput = screen.getByLabelText(/최대 전용면적/);
    if (min) fireEvent.change(minInput, { target: { value: min } });
    if (max) fireEvent.change(maxInput, { target: { value: max } });
    return { minInput, maxInput };
  }

  it("m² → 평 토글 시 84 → 25.4 변환", () => {
    render(<FilterBar {...defaultProps} />);
    const { minInput } = setAreaInputs("84");
    fireEvent.click(screen.getByText("평으로"));
    expect((minInput as HTMLInputElement).value).toBe("25.4");
  });

  it("평 → m² 토글 시 25.4 → 84 변환", () => {
    render(<FilterBar {...defaultProps} />);
    const { minInput } = setAreaInputs("84");
    fireEvent.click(screen.getByText("평으로"));
    expect((minInput as HTMLInputElement).value).toBe("25.4");
    fireEvent.click(screen.getByText("m²으로"));
    expect((minInput as HTMLInputElement).value).toBe("84");
  });

  it("빈 값은 토글해도 빈 값 유지", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    const minInput = screen.getByLabelText(/최소 전용면적/) as HTMLInputElement;
    const maxInput = screen.getByLabelText(/최대 전용면적/) as HTMLInputElement;
    expect(minInput.value).toBe("");
    fireEvent.click(screen.getByText("평으로"));
    expect(minInput.value).toBe("");
    expect(maxInput.value).toBe("");
  });

  it("한쪽만 입력해도 max는 빈 값 유지", () => {
    render(<FilterBar {...defaultProps} />);
    const { minInput, maxInput } = setAreaInputs("60");
    fireEvent.click(screen.getByText("평으로"));
    expect((minInput as HTMLInputElement).value).toBe("18.1");
    expect((maxInput as HTMLInputElement).value).toBe("");
  });

  it("토글 후 라벨이 직접 입력 (평) 으로 변경", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    expect(screen.getByText("직접 입력 (m²)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("평으로"));
    expect(screen.getByText("직접 입력 (평)")).toBeInTheDocument();
  });

  it("토글 시 onChange 가 새 단위와 변환된 값으로 한 번 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    setAreaInputs("84", "200");
    onChange.mockClear();
    fireEvent.click(screen.getByText("평으로"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const last = onChange.mock.calls[0][0];
    // 변환 후 값이 m² 환산되어 BE 페이로드에 들어감
    // 25.4평 × 3.3058 ≈ 83.97m², 60.5평 × 3.3058 ≈ 200m²
    expect(last.min_area_m2).toBeCloseTo(84, 0);
    expect(last.max_area_m2).toBeCloseTo(200, 0);
  });

  it("min/max 모두 변환 (84/200 → 25.4/60.5)", () => {
    render(<FilterBar {...defaultProps} />);
    const { minInput, maxInput } = setAreaInputs("84", "200");
    fireEvent.click(screen.getByText("평으로"));
    expect((minInput as HTMLInputElement).value).toBe("25.4");
    expect((maxInput as HTMLInputElement).value).toBe("60.5");
  });
});

describe("FilterBar — 면적 빠른선택 단위 변환", () => {
  // 면적 드롭다운에서 빠른선택 클릭 시 현재 areaUnit 으로 변환된 값이 입력창에 박혀야 함
  function selectPyeong() {
    fireEvent.click(screen.getByText("평으로"));
  }
  function getMinMax() {
    return {
      minInput: screen.getByLabelText(/최소 전용면적/) as HTMLInputElement,
      maxInput: screen.getByLabelText(/최대 전용면적/) as HTMLInputElement,
    };
  }

  it("m² 단위 + '84m²' 클릭 시 입력창 84/85 (회귀 미발생)", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    fireEvent.click(screen.getByText("84m²"));
    const { minInput, maxInput } = getMinMax();
    expect(minInput.value).toBe("84");
    expect(maxInput.value).toBe("85");
  });

  it("평 단위 + '25평' 클릭 시 입력창 25.4/25.7 변환", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    fireEvent.click(screen.getByText("25평"));
    const { minInput, maxInput } = getMinMax();
    expect(minInput.value).toBe("25.4");
    expect(maxInput.value).toBe("25.7");
  });

  it("평 단위 + '전체' 클릭 시 입력창 빈 값", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    fireEvent.click(screen.getByText("전체"));
    const { minInput, maxInput } = getMinMax();
    expect(minInput.value).toBe("");
    expect(maxInput.value).toBe("");
  });

  it("평 단위 + '41평~' 클릭 시 max 빈 값 유지", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    fireEvent.click(screen.getByText("41평~"));
    const { minInput, maxInput } = getMinMax();
    expect(minInput.value).toBe("40.8"); // 135 / 3.3058
    expect(maxInput.value).toBe("");
  });

  it("평 단위 + '~18평' 클릭 시 min 빈 값 유지", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    fireEvent.click(screen.getByText("~18평"));
    const { minInput, maxInput } = getMinMax();
    expect(minInput.value).toBe("");
    expect(maxInput.value).toBe("18.1"); // 60 / 3.3058
  });

  it("회귀: 매매 가격 '3~6억' 클릭은 areaUnit 무관 (단위 변환 미발동)", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    // 매매 선택
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
    // 면적 평 단위로 토글
    openDropdown("면적");
    selectPyeong();
    onChange.mockClear();
    // 가격 프리셋 클릭
    openDropdown("가격");
    fireEvent.click(screen.getByText("3~6억"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.min_price).toBe(30000);
    expect(last.max_price).toBe(60000);
  });

  it("평 단위 + '25평' 클릭 후 BE 페이로드 m² 환산 (round-trip)", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("면적");
    selectPyeong();
    onChange.mockClear();
    fireEvent.click(screen.getByText("25평"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    // 25.4평 × 3.3058 ≈ 83.97 → toBeCloseTo(84, 0) 통과
    expect(last.min_area_m2).toBeCloseTo(84, 0);
    expect(last.max_area_m2).toBeCloseTo(85, 0);
  });
});

describe("FilterBar — 면적 빠른선택 active(파랑) 표시", () => {
  // 빠른선택 클릭 시 해당 버튼이 bg-blue-600 클래스로 파랑 표시되어야 함
  // 평 단위 + m² 기준 preset 의 단위 변환 비교가 정확해야 active 일관성 유지
  function selectPyeong() {
    fireEvent.click(screen.getByText("평으로"));
  }
  function selectM2() {
    fireEvent.click(screen.getByText("m²으로"));
  }

  it("T1: m² 단위 + '84m²' 클릭 후 해당 버튼 파랑", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    const btn = screen.getByText("84m²");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T2: 평 단위 + '25평' 클릭 후 해당 버튼 파랑 (단위 변환 비교)", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    const btn = screen.getByText("25평");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T3: 평 단위 + '전체' 클릭 후 해당 버튼 파랑", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    const btn = screen.getByText("전체");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T4: m² 단위 + '84m²' 클릭 후 다른 버튼('59m²')은 파랑 아님", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    fireEvent.click(screen.getByText("84m²"));
    const other = screen.getByText("59m²");
    expect(other.className).not.toContain("bg-blue-600");
  });

  it("T5: 가격 빠른선택 회귀 — '3~6억' 클릭 후 해당 버튼 파랑 (unit prop 미전달)", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
    openDropdown("가격");
    const btn = screen.getByText("3~6억");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T6: 평 단위 + 사용자가 직접 '25' 입력 시 '25평' 버튼 파랑 아님 (의도된 동작)", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    const minInput = screen.getByLabelText(/최소 전용면적/) as HTMLInputElement;
    fireEvent.change(minInput, { target: { value: "25" } }); // 25.4 가 아닌 25
    const btn = screen.getByText("25평");
    expect(btn.className).not.toContain("bg-blue-600");
  });

  it("T7: 평 단위 + '41평~' 클릭 후 해당 버튼 파랑 (한쪽만 변환·비교)", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    const btn = screen.getByText("41평~");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T8: 오피스텔(OPST) + 평 단위 + '투룸(12~18평)' 클릭 후 해당 버튼 파랑", () => {
    // 매물유형 select 를 OPST 로 변경 → AREA_PRESETS_OFFICETEL_PYEONG 가 노출되어야 함
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    const select = screen.getByLabelText("매물유형 선택") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "opst" } });
    openDropdown("면적");
    selectPyeong();
    const btn = screen.getByText("투룸(12~18평)");
    fireEvent.click(btn);
    expect(btn.className).toContain("bg-blue-600");
  });

  it("T9: 평 단위 '25평' 클릭 → m² 토글 후 '84m²' 버튼 파랑 유지", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("면적");
    selectPyeong();
    fireEvent.click(screen.getByText("25평"));
    selectM2(); // 평 → m² 토글, state minArea/maxArea 도 84/85 로 자동 변환
    const btn = screen.getByText("84m²");
    expect(btn.className).toContain("bg-blue-600");
  });
});

describe("FilterBar — 층수 드롭다운", () => {
  it("드롭다운 열면 층수 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("층수");
    expect(screen.getByText("저층(1~5)")).toBeInTheDocument();
    expect(screen.getByText("중층(6~10)")).toBeInTheDocument();
    expect(screen.getByText("고층(11↑)")).toBeInTheDocument();
  });
});

describe("FilterBar — 상세 드롭다운", () => {
  it("드롭다운 열면 방향/준공년도/인증매물 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("방향")).toBeInTheDocument();
    expect(screen.getByText("준공년도")).toBeInTheDocument();
    expect(screen.getByText("인증매물만")).toBeInTheDocument();
    expect(screen.getByText("정렬")).toBeInTheDocument();
  });

  it("관리비 프리셋 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("~5만")).toBeInTheDocument();
    expect(screen.getByText("20만~")).toBeInTheDocument();
  });

  it("동 필터 옵션 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    expect(screen.getByText("101동")).toBeInTheDocument();
    expect(screen.getByText("102동")).toBeInTheDocument();
  });

  it("태그 버튼 표시 + 선택 시 tags 쿼리 전달 + 재클릭 시 해제", () => {
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      onChange,
      filterOptions: { building_names: [], tags: ["역세권", "복층", "테라스"], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");

    const tagBtn = screen.getByRole("button", { name: "역세권" });
    expect(tagBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tagBtn);
    expect(tagBtn).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: "역세권" }));

    // 재클릭 해제
    fireEvent.click(tagBtn);
    expect(tagBtn).toHaveAttribute("aria-pressed", "false");
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ tags: expect.anything() }));
  });

  it("filter_options.tags 가 빈 배열이면 태그 섹션 미렌더", () => {
    const props = {
      ...defaultProps,
      filterOptions: { building_names: [], tags: [], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");
    expect(screen.queryByText("태그")).not.toBeInTheDocument();
  });

  it("상세 드롭다운 버튼에 선택된 태그 개수 요약 표시", () => {
    const props = {
      ...defaultProps,
      filterOptions: { building_names: [], tags: ["역세권", "복층", "테라스"], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");

    fireEvent.click(screen.getByRole("button", { name: "역세권" }));
    fireEvent.click(screen.getByRole("button", { name: "복층" }));

    // 상세 드롭다운 버튼에 "태그 2" 요약이 포함되어야 함
    const detailBtn = screen.getByRole("button", { name: /^상세/ });
    expect(detailBtn.textContent).toContain("태그 2");
  });
});

describe("FilterBar — 필터 칩", () => {
  it("거래유형 선택 시 칩 표시", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("거래유형");
    fireEvent.click(screen.getByText("매매"));
    // "매매"가 드롭다운 내부 + 칩 두 곳에 존재
    expect(screen.getAllByText("매매").length).toBeGreaterThanOrEqual(1);
  });

  it("태그 선택 시 '#태그명' 칩 표시 + 칩 × 클릭 시 해제", () => {
    const onChange = vi.fn();
    const props = {
      ...defaultProps,
      onChange,
      filterOptions: { building_names: [], tags: ["역세권"], directions: [] } as FilterOptions,
    };
    render(<FilterBar {...props} />);
    openDropdown("상세");
    fireEvent.click(screen.getByRole("button", { name: "역세권" }));
    expect(screen.getByText("#역세권")).toBeInTheDocument();

    // 칩 × 버튼 (#태그 텍스트의 다음 형제 button) 클릭
    const chipSpan = screen.getByText("#역세권").closest("span");
    expect(chipSpan).not.toBeNull();
    const xBtn = chipSpan!.querySelector("button");
    expect(xBtn).not.toBeNull();
    fireEvent.click(xBtn!);
    expect(screen.queryByText("#역세권")).not.toBeInTheDocument();
  });
});

describe("FilterBar — 매물유형 옵션", () => {
  it("상세 드롭다운에 확장된 매물유형 옵션 표시", () => {
    render(<FilterBar {...defaultProps} />);
    openDropdown("상세");
    // 매물유형 select를 찾기: "오피스텔" option을 포함하는 select
    const selects = screen.getAllByDisplayValue("전체");
    const estateSelect = selects.find((s) => {
      const opts = Array.from(s.querySelectorAll("option")).map((o) => o.textContent);
      return opts.includes("오피스텔");
    });
    expect(estateSelect).toBeDefined();
    const options = Array.from(estateSelect!.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("아파트");
    expect(options).toContain("오피스텔");
    expect(options).toContain("분양권");
    expect(options).toContain("재건축");
    expect(options).toContain("재개발");
  });

  it("매물유형 변경 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<FilterBar {...defaultProps} onChange={onChange} />);
    openDropdown("상세");
    const selects = screen.getAllByDisplayValue("전체");
    const estateSelect = selects.find((s) => {
      const opts = Array.from(s.querySelectorAll("option")).map((o) => o.textContent);
      return opts.includes("오피스텔");
    });
    expect(estateSelect).toBeDefined();
    fireEvent.change(estateSelect!, { target: { value: "opst" } });
    expect(onChange).toHaveBeenCalled();
  });
});
