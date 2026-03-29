/**
 * 미분양 상세 페이지 통합 테스트 — 기본 렌더링, 섹션 표시, 404, 에러
 * 실행: npx vitest run src/app/__tests__/mibunyang-detail.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/lib/api", () => ({
  getMbApartmentDetail: (...args: unknown[]) => mockDetail(...args),
  getMbUnsoldHistory: (...args: unknown[]) => mockHistory(...args),
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
});
