/**
 * 미분양 상세 페이지 통합 테스트 — 기본 렌더링, 섹션 표시, 404, 에러
 * 실행: npx vitest run src/app/__tests__/mibunyang-detail.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MbDetailPage from "../mibunyang/[id]/page";
import { TestQueryProvider } from "@/test-setup";

const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: mockBack }),
  useParams: () => ({ id: "APT001" }),
  usePathname: () => "/mibunyang/APT001",
}));

const mockDetail = vi.fn();
const mockHistory = vi.fn();
const mockPresaleDetail = vi.fn();

vi.mock("@/lib/api", () => ({
  getMbApartmentDetail: (...args: unknown[]) => mockDetail(...args),
  getMbUnsoldHistory: (...args: unknown[]) => mockHistory(...args),
  getMbPresaleDetail: (...args: unknown[]) => mockPresaleDetail(...args),
}));

function createMockDetail() {
  return {
    id: "APT001",
    name: "래미안 테스트",
    region: "서울특별시",
    gu: "강남구",
    dong: "역삼동",
    address: "역삼로 123",
    units: 1200,
    unsold: 50,
    builder: "삼성물산",
    completion: "2025.06",
    presale_min_price: 80000,
    presale_max_price: 120000,
    trade_stats: {
      apartment_id: "APT001",
      nearby_median: 95000,
      jeonse_rate: 65.3,
      // 단지 단위 전세가율 — 구 단위 jeonse_rate(65.3)와 일부러 다른 값 (세션 471)
      complex_jeonse_rate: 61.2,
      complex_jeonse_n: 8,
      complex_sale_n: 15,
      pir: 12.5,
    },
    infra: { hospital: 3, hospital_dist: 500, mart: 2, mart_dist: 300 },
    school: { school_score: 85, school_grade: "A" },
    transport: { subway_name: "역삼역", subway_dist: 200, bus_routes: 15 },
    builder_info: { name: "삼성물산", debt_ratio: 45.2, credit_grade: "AA", hug_guarantee: true },
  };
}

function renderDetail() {
  return render(
    <TestQueryProvider>
      <MbDetailPage />
    </TestQueryProvider>,
  );
}

describe("미분양 상세 — 정상 렌더링", () => {
  beforeEach(() => {
    mockDetail.mockResolvedValue(createMockDetail());
    mockHistory.mockResolvedValue({
      apartment_id: "APT001",
      items: [
        { id: 1, apartment_id: "APT001", base_month: "202601", unsold_count: 60, change: -10 },
        { id: 2, apartment_id: "APT001", base_month: "202602", unsold_count: 50, change: -10 },
      ],
    });
  });

  it("아파트 이름이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "래미안 테스트" })).toBeInTheDocument();
    });
  });

  it("지역 정보가 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getAllByText(/서울특별시/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/강남구/).length).toBeGreaterThan(0);
    });
  });

  it("미분양 세대수가 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/미분양 50세대/)).toBeInTheDocument();
    });
  });

  it("개요 섹션이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("개요")).toBeInTheDocument();
      expect(screen.getByText("삼성물산")).toBeInTheDocument();
    });
  });

  it("분양 정보 섹션이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("분양 정보")).toBeInTheDocument();
    });
  });

  it("주변 환경 섹션이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("주변 환경")).toBeInTheDocument();
      expect(screen.getByText("역삼역")).toBeInTheDocument();
    });
  });

  it("거래 통계 섹션이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("거래 통계")).toBeInTheDocument();
    });
  });

  it("미분양 추이 섹션이 표시된다", async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("미분양 추이")).toBeInTheDocument();
    });
  });
});

describe("미분양 상세 — nested 데이터 null", () => {
  it("거래 통계 없으면 안내 메시지 표시", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), trade_stats: undefined });
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("거래 통계 데이터가 없습니다.")).toBeInTheDocument();
    });
  });

  it("주변 환경 없으면 안내 메시지 표시", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), infra: undefined, school: undefined, transport: undefined });
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("주변 환경 데이터가 없습니다.")).toBeInTheDocument();
    });
  });
});

// 세션 471: 거래 통계의 전세율 칸은 단지 단위 값(complex_jeonse_rate)만 보여 준다.
// 구(區) 단위 jeonse_rate 가 단지 칸처럼 보이던 결함(B28)이 다시 새지 않는지 지킨다.
// 세션 471 B28: 개요의 네이버 인근 시세·네이버 전세가율(구 단위·반경 2km 값)은 뺐다 — 다시 들어오면 잡는다(검사관 🟡)
describe("미분양 상세 — 네이버 구 단위 칸 제거", () => {
  it("개요에 '네이버 인근 시세'·'네이버 전세가율'이 없고 '네이버 매물 수'는 있다", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), naver_nearby_median: 80000, naver_jeonse_rate: 58, naver_sell_count: 12 });
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    expect(await screen.findByText("네이버 매물 수")).toBeInTheDocument();
    expect(screen.queryByText("네이버 인근 시세")).not.toBeInTheDocument();
    expect(screen.queryByText("네이버 전세가율")).not.toBeInTheDocument();
  });
});

describe("미분양 상세 — 전세율(이 단지) 칸", () => {
  beforeEach(() => {
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
  });

  it("단지 전세가율과 표본 건수가 표시된다", async () => {
    mockDetail.mockResolvedValue(createMockDetail());
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("전세율(이 단지 · 대표 평수)")).toBeInTheDocument();
    });
    expect(screen.getByText(/전용면적이 같은 거래끼리 전세 중앙값 ÷ 매매 중앙값 · 표본 전세 8건·매매 15건 · 국토교통부 실거래가 기반\(미분양 계산\)/)).toBeInTheDocument();
    expect(screen.getByText("61.2%")).toBeInTheDocument();
  });

  it("단지 값이 없으면 '-' 이고 구 단위 값(65.3%)은 화면에 없다", async () => {
    const base = createMockDetail();
    const tradeStats: Record<string, unknown> = { ...base.trade_stats };
    delete tradeStats.complex_jeonse_rate; // jeonse_rate: 65.3 은 그대로 둔다
    mockDetail.mockResolvedValue({ ...base, trade_stats: tradeStats });
    renderDetail();
    const label = await screen.findByText("전세율(이 단지 · 대표 평수)");
    expect(label.nextElementSibling?.textContent).toBe("-");
    expect(screen.queryByText("65.3%")).not.toBeInTheDocument();
  });

  // 검사관 🟡(세션 471): 새 BE 는 표본 부족 단지에 undefined 가 아니라 null 을 보낸다 — null 도 "-" 여야 하고 건수 줄이 붙으면 안 된다
  it("단지 값이 null(표본 부족)이면 '-' 이고 건수 줄도 없다", async () => {
    const base = createMockDetail();
    mockDetail.mockResolvedValue({
      ...base,
      trade_stats: { ...base.trade_stats, complex_jeonse_rate: null, complex_jeonse_n: 1, complex_sale_n: 4 },
    });
    renderDetail();
    const label = await screen.findByText("전세율(이 단지 · 대표 평수)");
    expect(label.nextElementSibling?.textContent).toBe("-");
    expect(screen.queryByText(/전세 1건/)).not.toBeInTheDocument();
  });
});

// 세션 472 PR 2: 막대·색·등급 라벨(우리 분위수 문턱)을 지우고 값 + 공인 기준·출처 한 줄로
describe("미분양 상세 — 막대·등급 라벨 대신 값과 공인 기준·출처", () => {
  // 옛 막대 14종·대기질·범죄 등급이 쓰던 판정 낱말 — 화면 어디에도 없어야 한다
  const OLD_LABELS = [
    "적정", "주의", "위험", "저부담", "고부담", "쾌적", "고밀", "우수", "충분", "부족",
    "저렴", "조용함", "시끄러움", "멀음", "가까움", "소규모", "대규모",
  ];

  function richDetail() {
    const base = createMockDetail();
    return {
      ...base,
      max_floor: 34,
      parking_ratio: 1.2,
      floor_area_ratio: 214,
      building_coverage_ratio: 15,
      exclusive_ratio: 72.9,
      avg_maintenance_cost: 14,
      unsold_rate: 11.6,
      noise: 60,
      noxious_dist: 1200,
      naver_school_walk_min: 7,
      crime_safety_grade: 2,
      trade_stats: { ...base.trade_stats, cancel_ratio_6m: 2.1 },
      infra: {
        ...base.infra,
        crime_score: 72,
        crime_grade: "B",
        air_annual: { pm25: 13, pm10: 30, o3: 0.03, years: "2022,2023,2024", band: "좋음", legend: "좋음 15 이하", updated_at: null },
      },
    };
  }

  beforeEach(() => {
    mockDetail.mockResolvedValue(richDetail());
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
  });

  it("ⓐ 옛 판정 낱말이 화면에 없고 막대(progressbar)도 없다", async () => {
    renderDetail();
    await screen.findByText("34층");
    const text = document.body.textContent ?? "";
    for (const word of OLD_LABELS) expect(text, word).not.toContain(word);
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("ⓑ 값 옆에 법령·공공 통계 기준 줄이 붙는다", async () => {
    renderDetail();
    expect(await screen.findByText("1.20대")).toBeInTheDocument();
    expect(screen.getByText(/주택건설기준 등에 관한 규정 §27/)).toBeInTheDocument();
    expect(screen.getByText("고층건축물(30층 이상 또는 120m 이상, 건축법 §2)")).toBeInTheDocument();
    expect(screen.getByText(/주거실태조사 2024 자가가구 PIR 전국 6.3배 · 수도권 8.7배/)).toBeInTheDocument();
    expect(screen.getByText("2.1%")).toBeInTheDocument();
    expect(screen.getByText(/부동산 거래신고 등에 관한 법률 §3의2/)).toBeInTheDocument();
    expect(screen.getByText("50~100m")).toBeInTheDocument();
    expect(screen.getByText("약 1,200m")).toBeInTheDocument();
    expect(screen.getByText(/교육환경 보호에 관한 법률 §8/)).toBeInTheDocument();
    expect(screen.getByText("13.0㎍/㎥ (3년 평균)")).toBeInTheDocument();
    expect(screen.getByText(/^이 값은 국가 대기환경기준\(연평균 15㎍\/㎥\) 이하 · /)).toBeInTheDocument();
  });

  it("ⓒ 우리 범죄 점수·지역 등급은 보이지 않는다", async () => {
    renderDetail();
    await screen.findByText("34층");
    // 안전 섹션 자체는 그려져 있어야 이 단언이 의미가 있다(빈 화면 통과 방지 — 검사관 🟠)
    expect(screen.getByText("단지 안전 등급")).toBeInTheDocument();
    expect(screen.queryByText("72/100")).not.toBeInTheDocument();
    expect(screen.queryByText("안전 점수")).not.toBeInTheDocument();
    expect(screen.queryByText("지역 안전 등급")).not.toBeInTheDocument();
    expect(screen.queryByText("매우 안전")).not.toBeInTheDocument();
  });

  it("ⓓ 페이지 맨 끝에 출처 묶음 단락이 있다", async () => {
    renderDetail();
    const footer = await screen.findByTestId("mb-sources-footer");
    expect(footer.textContent).toContain("국토교통부 실거래가 공개시스템");
    expect(footer.textContent).toContain("법령: 국가법령정보센터");
  });
});

describe("미분양 상세 — 에러 처리", () => {
  it("404 에러 시 안내 메시지 표시", async () => {
    mockDetail.mockRejectedValue(new Error("API 오류: 404"));
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("아파트를 찾을 수 없습니다.")).toBeInTheDocument();
    });
  });

  it("서버 에러 시 일반 에러 메시지 표시", async () => {
    mockDetail.mockRejectedValue(new Error("서버 오류"));
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("데이터를 불러오지 못했습니다.")).toBeInTheDocument();
    });
  });

  it("에러 시 뒤로가기 + 재시도 버튼 표시", async () => {
    mockDetail.mockRejectedValue(new Error("서버 오류"));
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("뒤로 가기")).toBeInTheDocument();
      expect(screen.getByText("다시 시도")).toBeInTheDocument();
    });
  });

  // 세션 298: 추이 섹션 에러 dead-end 해소 — detail 정상 + history 실패 시 retry
  it("추이 에러 시 '다시 시도' 클릭하면 추이를 재조회한다", async () => {
    mockDetail.mockResolvedValue(createMockDetail());
    mockHistory.mockRejectedValueOnce(new Error("서버 오류"));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("추이 데이터를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    const callsBefore = mockHistory.mock.calls.length;
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    fireEvent.click(screen.getByText("다시 시도"));
    await waitFor(() => {
      expect(mockHistory.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

describe("미분양 상세 — 분양 단지 청약 일정·평형공급 (세션 314 PR E)", () => {
  beforeEach(() => {
    mockPresaleDetail.mockClear();
    mockHistory.mockResolvedValue({ apartment_id: "APT001", items: [] });
    mockPresaleDetail.mockResolvedValue({
      ...createMockDetail(),
      presale_type: "민간분양",
      schedules: [
        { id: 1, apartment_id: "APT001", house_manage_no: "H1", recruit_date: "2026-06-05", winner_announce_date: "2026-06-20" },
      ],
      unit_supplies: [
        { id: 1, apartment_id: "APT001", house_manage_no: "H1", model_no: "1", house_ty: "084.0000A", general_supply: 80, special_supply: 20, special_supply_breakdown: [{ key: "dazanyeo", label: "다자녀", count: 10 }], top_amount: 120000 },
      ],
      presale_summary: {
        total_general_supply: 80, total_special_supply: 20, total_supply: 100,
        special_by_type_total: [{ key: "dazanyeo", label: "다자녀", count: 10 }],
        max_top_amount: 120000, min_top_amount: 80000, unit_type_count: 1, schedule_count: 1,
      },
    });
  });

  it("분양 단지(presale_type 보유)면 청약 일정 섹션이 렌더된다", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), presale_type: "민간분양" });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("청약 일정")).toBeInTheDocument();
      expect(screen.getByText("2026.06.05")).toBeInTheDocument();
    });
  });

  it("분양 단지면 평형별 공급 섹션이 렌더된다 (특공 한글 라벨)", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), presale_type: "민간분양" });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("평형별 공급 현황")).toBeInTheDocument();
      expect(screen.getByText("84㎡A")).toBeInTheDocument();
      expect(screen.getByText("다자녀 10세대")).toBeInTheDocument();
    });
  });

  it("미분양 단지(presale_type 없음)면 청약 일정 섹션 미렌더 + getMbPresaleDetail 미호출", async () => {
    mockDetail.mockResolvedValue(createMockDetail()); // presale_type 없음
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "래미안 테스트" })).toBeInTheDocument();
    });
    expect(screen.queryByText("청약 일정")).not.toBeInTheDocument();
    expect(mockPresaleDetail).not.toHaveBeenCalled();
  });

  // 세션 317: 분양 청약 조회 실패가 섹션 silent 소멸로 끝나지 않도록 에러+재시도 노출
  it("분양 단지인데 청약 조회 실패 시 에러 문구+다시 시도 노출, 클릭하면 재조회한다", async () => {
    mockDetail.mockResolvedValue({ ...createMockDetail(), presale_type: "민간분양" });
    mockPresaleDetail.mockReset();
    mockPresaleDetail.mockRejectedValueOnce(new Error("서버 오류"));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText("청약 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    const callsBefore = mockPresaleDetail.mock.calls.length;
    mockPresaleDetail.mockResolvedValue({
      ...createMockDetail(),
      presale_type: "민간분양",
      schedules: [
        { id: 1, apartment_id: "APT001", house_manage_no: "H1", recruit_date: "2026-06-05", winner_announce_date: "2026-06-20" },
      ],
      unit_supplies: [],
      presale_summary: {
        total_general_supply: 0, total_special_supply: 0, total_supply: 0,
        special_by_type_total: [], max_top_amount: 0, min_top_amount: 0, unit_type_count: 0, schedule_count: 1,
      },
    });
    fireEvent.click(screen.getByText("다시 시도"));
    await waitFor(() => {
      expect(mockPresaleDetail.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
