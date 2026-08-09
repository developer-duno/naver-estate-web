/**
 * PropertyTaxComplexPicker 회귀 가드 (PR-C 신설)
 *
 * 보유세 계산기 공시가격 자동입력 — 단지 선택 → 평형 선택 → 공시가격 채움.
 * 🔴 핵심 가드: price_median(호 전체)을 지분율로 나누거나 곱하지 않는다.
 *    property-tax.ts:115 엔진이 이미 ownershipRatio 를 곱하므로 여기서 또 곱하면 제곱 축소.
 *
 * 실행: npx vitest run src/app/tools/property-tax/__tests__/PropertyTaxComplexPicker.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PropertyTaxComplexPicker from "../PropertyTaxComplexPicker";
import { TestQueryProvider } from "@/test-setup";
import type { OfficialPriceResponse } from "@/types";

const mockGetOfficialPrices = vi.fn<(no: string) => Promise<OfficialPriceResponse>>();
// 🔴 DB 검색(searchComplexesDb) 사용 — 라이브 네이버 크롤(searchComplexes)이 아니다.
// 공개 계산기 페이지라 실시간 크롤 경로를 타면 IP 차단 위험.
const mockSearchComplexesDb = vi.fn();

vi.mock("@/lib/api/complex", () => ({
  getOfficialPrices: (no: string) => mockGetOfficialPrices(no),
  searchComplexesDb: (kw: string) => mockSearchComplexesDb(kw),
}));

// 즐겨찾기 후보 1건 고정 — 검색 없이도 단지 선택 버튼이 뜨게 한다
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({
    favorites: [{ complex_no: "C001", complex_name: "은마아파트", added_at: 0 }],
    isFavorite: () => true,
    toggle: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCompare", () => ({
  useCompare: () => ({
    list: [],
    isInCompare: () => false,
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    toggle: vi.fn(),
    isFull: false,
  }),
}));

const OK_RESPONSE: OfficialPriceResponse = {
  complex_no: "C001",
  year: "2026",
  items: [
    { prvuse_ar: 76.79, price_median: 1_234_000_000, ho_count: 120 },
    { prvuse_ar: 84.43, price_median: 1_500_000_000, ho_count: 200 },
  ],
};

/**
 * 실제 부모(PropertyTaxCalculator)와 같은 state 왕복을 재현하는 하네스.
 * 부모가 publishedManwon 을 되돌려줘야 출처 캡션이 뜨는 구조라, 고정 prop 으로는
 * 실제 동작을 검증할 수 없다. 수동 수정 재현용 입력란도 함께 둔다.
 */
function Harness({ ownershipPercent, onFill }: { ownershipPercent: number; onFill: (v: number) => void }) {
  const [publishedManwon, setPublishedManwon] = useState(0);
  return (
    <>
      <PropertyTaxComplexPicker
        ownershipPercent={ownershipPercent}
        publishedManwon={publishedManwon}
        onFill={(v) => {
          setPublishedManwon(v);
          onFill(v);
        }}
      />
      <input
        aria-label="공시가격 수동 입력"
        type="number"
        value={publishedManwon}
        onChange={(e) => setPublishedManwon(Number(e.target.value) || 0)}
      />
    </>
  );
}

function renderPicker(ownershipPercent = 0) {
  const onFill = vi.fn();
  const utils = render(
    <TestQueryProvider>
      <Harness ownershipPercent={ownershipPercent} onFill={onFill} />
    </TestQueryProvider>,
  );
  return { onFill, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchComplexesDb.mockResolvedValue({ complexes: [], total: 0 });
});

describe("PropertyTaxComplexPicker", () => {
  it("평형을 고르면 price_median 을 만원 단위로 그대로 채운다 (지분 이중곱 없음)", async () => {
    mockGetOfficialPrices.mockResolvedValue(OK_RESPONSE);
    const user = userEvent.setup();
    const { onFill } = renderPicker(0);

    await user.click(screen.getByRole("button", { name: "은마아파트" }));

    const select = await screen.findByLabelText("공시가격 평형 선택");
    await user.selectOptions(select, "84.43");

    // 1_500_000_000 원 → 150000 만원. 지분율을 곱하지 않은 호 전체 값 그대로.
    expect(onFill).toHaveBeenCalledWith(150_000);
    expect(await screen.findByText("출처: 국토교통부 공동주택가격 (2026년 기준)")).toBeInTheDocument();
  });

  it("지분율 > 0 이면 호 전체 공시가 경고 캡션을 띄운다", async () => {
    mockGetOfficialPrices.mockResolvedValue(OK_RESPONSE);
    const user = userEvent.setup();
    const { onFill } = renderPicker(50);

    await user.click(screen.getByRole("button", { name: "은마아파트" }));
    const select = await screen.findByLabelText("공시가격 평형 선택");
    await user.selectOptions(select, "76.79");

    // 🔴 지분 50% 여도 호 전체 값(123400 만원) 그대로 — 엔진이 지분을 곱한다
    expect(onFill).toHaveBeenCalledWith(123_400);
    expect(
      await screen.findByText(/호 전체 공시가입니다/),
    ).toBeInTheDocument();
  });

  it("items 가 빈 배열이면 데이터 없음 안내를 띄운다 (입력 강제 없음)", async () => {
    mockGetOfficialPrices.mockResolvedValue({ complex_no: "C001", year: null, items: [] });
    const user = userEvent.setup();
    const { onFill } = renderPicker();

    await user.click(screen.getByRole("button", { name: "은마아파트" }));

    expect(
      await screen.findByText(/이 단지는 공시가격 데이터가 없습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("공시가격 평형 선택")).not.toBeInTheDocument();
    expect(onFill).not.toHaveBeenCalled();
  });

  it("공시가격 조회 실패 시 isError 로 에러 UI + 다시 시도 버튼을 띄운다 (삼킴 금지)", async () => {
    mockGetOfficialPrices.mockRejectedValue(new Error("500"));
    const user = userEvent.setup();
    const { onFill } = renderPicker();

    await user.click(screen.getByRole("button", { name: "은마아파트" }));

    expect(
      await screen.findByText(/공시가격을 불러오지 못했습니다/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(onFill).not.toHaveBeenCalled();
  });

  it("검색은 DB 경로(searchComplexesDb)로만 나간다 — 네이버 라이브 크롤 금지", async () => {
    mockSearchComplexesDb.mockResolvedValue({
      complexes: [{ complex_no: "C009", complex_name: "잠실주공5단지" }],
      total: 1,
    });
    const user = userEvent.setup();
    renderPicker();

    await user.type(screen.getByLabelText("단지 검색"), "잠실");

    // debounce(300ms) 후 DB 검색 1회 — 라이브 크롤 래퍼는 mock 에 존재조차 하지 않는다
    await waitFor(() => expect(mockSearchComplexesDb).toHaveBeenCalledWith("잠실"));
    expect(await screen.findByRole("button", { name: "잠실주공5단지" })).toBeInTheDocument();
  });

  it("자동 채운 값과 현재 입력값이 달라지면 출처 캡션이 사라진다 (수동 수정 해제)", async () => {
    mockGetOfficialPrices.mockResolvedValue(OK_RESPONSE);
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: "은마아파트" }));
    const select = await screen.findByLabelText("공시가격 평형 선택");
    await user.selectOptions(select, "84.43");
    expect(await screen.findByText(/출처: 국토교통부 공동주택가격/)).toBeInTheDocument();

    // 사용자가 입력란을 직접 고치면 자동 채운 값과 어긋나므로 캡션이 해제돼야 한다
    const manual = screen.getByLabelText("공시가격 수동 입력");
    await user.clear(manual);
    await user.type(manual, "99999");

    await waitFor(() =>
      expect(screen.queryByText(/출처: 국토교통부 공동주택가격/)).not.toBeInTheDocument(),
    );
  });
});
