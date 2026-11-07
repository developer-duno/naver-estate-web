/**
 * 미분양 비교 페이지 테스트 — 렌더링, 인쇄, URL복사, 단지명 링크
 * 실행: npx vitest run src/app/__tests__/mibunyang-compare.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MbComparePage from "../mibunyang/compare/page";
import { TestQueryProvider } from "@/test-setup";
import * as api from "@/lib/api";


const mockPush = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams(),
}));

// next/dynamic 은 전역 test-setup 이 null 렌더로 바꿔 둔다 — datasets 를 받는 비교 추이 그래프만
// 받은 값을 글자로 드러내는 가짜로 바꾼다(가격 그래프는 apartments 를 받으므로 계속 null)
vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub({ datasets }: { datasets?: unknown[] }) {
    return datasets !== undefined
      ? <div data-testid="mb-compare-unsold-chart-stub" data-datasets={JSON.stringify(datasets)} />
      : null;
  },
}));

function makeApt(id: string, name: string) {
  return {
    id, name, region: "서울", gu: "강남", units: 500, unsold: 10,
    unsold_rate: 2.0, presale_min_price: 40000, presale_max_price: 80000,
    presale_pp: 2500, parking_ratio: 1.2, max_floor: 30,
    discount_pct: 5, floor_area_ratio: 250, builder: "테스트건설",
    noise: 55,
  };
}

vi.mock("@/lib/api", () => ({
  getMbApartmentDetail: vi.fn().mockImplementation((id: string) =>
    Promise.resolve(makeApt(id, `단지${id}`)),
  ),
  getMbUnsoldHistory: vi.fn().mockImplementation((id: string) =>
    Promise.resolve({ apartment_id: id, items: [] }),
  ),
}));

function renderPage(params = "") {
  mockSearchParams.mockReturnValue(new URLSearchParams(params));
  return render(
    <TestQueryProvider>
      <MbComparePage />
    </TestQueryProvider>,
  );
}

describe("미분양 비교 — 빈 상태", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("ids 없으면 안내 메시지가 표시된다", () => {
    renderPage();
    expect(screen.getByText("비교할 아파트를 선택해주세요.")).toBeInTheDocument();
  });

  it("ids 1개면 2개 이상 안내가 표시된다", async () => {
    renderPage("ids=A1");
    await waitFor(() => {
      expect(screen.getByText("비교할 아파트를 2개 이상 선택해주세요.")).toBeInTheDocument();
    });
  });
});

describe("미분양 비교 — 정상 렌더링", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("2개 단지 비교 시 테이블 헤더에 단지명이 표시된다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      // 단지명은 헤더(th)와 데이터(td) 모두에 표시됨
      expect(screen.getAllByText("단지A1").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("단지A2").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("아파트 개수 뱃지가 표시된다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("(2개 아파트)")).toBeInTheDocument();
    });
  });

  it("비교 행이 표시된다 (세대수, 미분양 등)", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getAllByText("세대수").length).toBeGreaterThan(0);
      expect(screen.getAllByText("미분양").length).toBeGreaterThan(0);
      expect(screen.getAllByText("평당가(만원)").length).toBeGreaterThan(0);
    });
  });
});

describe("미분양 비교 — 인쇄/복사/링크", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("인쇄 버튼 클릭 시 window.print가 호출된다", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("인쇄")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("인쇄"));
    // rAF 2회 대기
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("URL 복사 버튼 클릭 시 clipboard API가 호출된다", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeMock } });

    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByText("URL 복사")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("URL 복사"));
    await waitFor(() => {
      expect(writeMock).toHaveBeenCalled();
    });
  });

  it("단지명 클릭 시 상세 페이지로 이동한다", async () => {
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getAllByText("단지A1").length).toBeGreaterThanOrEqual(1);
    });
    // 헤더의 th 요소 클릭 (첫 번째 매칭)
    fireEvent.click(screen.getAllByText("단지A1")[0]);
    expect(mockPush).toHaveBeenCalledWith("/mibunyang/A1");
  });
});

describe("미분양 비교 — 에러 분기", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 정상 케이스 복원
    vi.mocked(api.getMbApartmentDetail).mockImplementation((id: string) =>
      Promise.resolve(makeApt(id, `단지${id}`)),
    );
    vi.mocked(api.getMbUnsoldHistory).mockImplementation((id: string) =>
      Promise.resolve({ apartment_id: id, items: [] }),
    );
  });

  it("일부 단지 fail 시 배너 + 헤더 count 가 표시된다", async () => {
    // 2개 중 1개(A2) 실패
    vi.mocked(api.getMbApartmentDetail).mockImplementation((id: string) =>
      id === "A2"
        ? Promise.reject(new Error("backend down"))
        : Promise.resolve(makeApt(id, `단지${id}`)),
    );
    renderPage("ids=A1,A2");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("1개 아파트 정보를 불러오지 못했습니다.");
    });
    expect(screen.getByText(/1개 아파트.*\/ 선택 2개/)).toBeInTheDocument();
  });

});

// 세션 472 PR 3 — 비교 화면 중립화: 판정(★·종합 우위·가중치) 없이 값 + 출처 각주
describe("미분양 비교 — 값과 출처만 (판정 표시 없음)", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // 두 단지 값이 갈라져야 옛 ★ 가 어느 한쪽에 붙는다 — 같은 값이면 ★ 가 둘 다 붙거나 안 붙어 구분이 안 된다
    vi.mocked(api.getMbApartmentDetail).mockImplementation((id: string) =>
      Promise.resolve(
        id === "A1"
          ? { ...makeApt(id, `단지${id}`), noise: 70, units: 900, unsold: 3, presale_min_price: 30000 }
          : makeApt(id, `단지${id}`),
      ),
    );
    vi.mocked(api.getMbUnsoldHistory).mockImplementation((id: string) =>
      Promise.resolve({
        apartment_id: id,
        items: [{ id: 1, apartment_id: id, base_month: "2026-08", unsold_count: id === "A1" ? 3 : 10 }],
      }),
    );
  });

  it("비교표·카드·그림 어디에도 판정 ★·종합 우위·가중치 글자가 없다", async () => {
    const { container } = renderPage("ids=A1,A2");
    await screen.findAllByText("단지A1");
    // 표 칸·모바일 카드 값 칸에 ★ 가 붙지 않는다
    const cells = Array.from(container.querySelectorAll("td, dd"));
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.textContent).not.toContain("★");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/종합 우위|가중치|프리셋|레이더|최저가:|미분양 최소/);
  });

  it("맨 아래에 자료·법령 출처 각주가 있다", async () => {
    renderPage("ids=A1,A2");
    const footer = await screen.findByTestId("mb-sources-footer");
    expect(footer).toHaveTextContent("출처:");
    expect(footer).toHaveTextContent("국토교통부 미분양주택현황");
  });

  it("소음 행은 dB 대신 큰 도로 거리 구간 글 (구간 밖 값은 '-')", async () => {
    const { container } = renderPage("ids=A1,A2");
    await screen.findAllByText("큰 도로 거리(추정)");
    expect(screen.queryByText("소음도(dB)")).not.toBeInTheDocument();
    const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
      tr.textContent?.startsWith("큰 도로 거리(추정)"),
    )!;
    const tds = Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
    expect(tds).toEqual(["큰 도로 거리(추정)", "50m 이내", "-"]);
  });

  it("즐겨찾기(저장) 별 버튼은 그대로 있다", async () => {
    renderPage("ids=A1,A2");
    expect(await screen.findByRole("button", { name: "☆ 저장" })).toBeInTheDocument();
  });
});

// 세션 502 — 미분양 수 비공개 단지는 비교 추이 선도 그리지 않는다(상세 화면과 같은 결정)
describe("미분양 비교 — 미분양 수 비공개 단지는 추이 점을 비운다", () => {
  beforeEach(() => {
    mockPush.mockClear();
    vi.mocked(api.getMbApartmentDetail).mockImplementation((id: string) =>
      Promise.resolve(id === "A1" ? { ...makeApt(id, `단지${id}`), unsold_hidden: true } : makeApt(id, `단지${id}`)),
    );
    // 두 단지 모두 옛 추이 점이 있다 — 비공개 단지만 비어야 한다
    vi.mocked(api.getMbUnsoldHistory).mockImplementation((id: string) =>
      Promise.resolve({
        apartment_id: id,
        items: [{ id: 1, apartment_id: id, base_month: "202608", unsold_count: 7 }],
      }),
    );
  });

  async function readDatasets() {
    const stub = await screen.findByTestId("mb-compare-unsold-chart-stub");
    // 추이 응답이 풀려 둘째 단지 점이 들어올 때까지 기다린다 — 응답 전 빈 값을 통과하지 않게
    await waitFor(() => {
      const ds = JSON.parse(stub.getAttribute("data-datasets") ?? "[]") as { apartmentId: string; items: unknown[] }[];
      expect(ds.find((d) => d.apartmentId === "A2")?.items.length).toBe(1);
    });
    return JSON.parse(stub.getAttribute("data-datasets") ?? "[]") as {
      apartmentId: string; items: unknown[]; isError: boolean;
    }[];
  }

  it("비공개 단지(A1)는 빈 items·오류 아님, 단지 순서는 그대로, 다른 단지(A2)는 점 그대로", async () => {
    renderPage("ids=A1,A2");
    const datasets = await readDatasets();
    expect(datasets.map((d) => d.apartmentId)).toEqual(["A1", "A2"]);
    expect(datasets[0].items).toEqual([]);
    expect(datasets[0].isError).toBe(false);
    expect(datasets[1].items).toHaveLength(1);
  });
});
