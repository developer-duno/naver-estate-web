/**
 * 미분양 상세 — 미분양 수 비공개 단지(대구시 명단) 머리 줄·그래프 위 안내 시험 (세션 500)
 * 옛 서버 응답(unsold_hidden 칸 없음)은 지금 화면과 똑같아야 한다.
 * 실행: npx vitest run src/app/__tests__/mibunyang-detail-unsold-hidden.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MbDetailPage from "../mibunyang/[id]/page";
import { TestQueryProvider } from "@/test-setup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "ah-2021910048" }),
  usePathname: () => "/mibunyang/ah-2021910048",
}));

const mockDetail = vi.fn();
const mockHistory = vi.fn();

// next/dynamic 은 전역 test-setup 이 null 렌더로 바꿔 그래프 유무를 못 본다 — items 를 받는 추이 그래프만 보이는 가짜로
// (위치 지도도 dynamic 이지만 items 를 안 받고, 이 시험의 단지는 좌표가 없어 아예 안 그린다)
vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub({ items }: { items?: unknown[] }) {
    return items !== undefined ? <div data-testid="mb-unsold-chart-stub" /> : null;
  },
}));

vi.mock("@/lib/api", () => ({
  getMbApartmentDetail: (...args: unknown[]) => mockDetail(...args),
  getMbUnsoldHistory: (...args: unknown[]) => mockHistory(...args),
  getMbPresaleDetail: vi.fn(),
}));

function detail(overrides: Record<string, unknown> = {}) {
  return { id: "ah-2021910048", name: "북구청역 푸르지오 에듀포레", region: "대구", gu: "북구", dong: "읍내동", units: 499, ...overrides };
}

const HISTORY = {
  apartment_id: "ah-2021910048",
  items: [
    { id: 2, apartment_id: "ah-2021910048", base_month: "202608", unsold_count: 55 },
    { id: 1, apartment_id: "ah-2021910048", base_month: "202607", unsold_count: 60 },
  ],
};

async function renderWith(d: Record<string, unknown>, history = HISTORY) {
  mockDetail.mockResolvedValue(d);
  mockHistory.mockResolvedValue(history);
  render(
    <TestQueryProvider>
      <MbDetailPage />
    </TestQueryProvider>,
  );
  await screen.findByRole("heading", { name: "북구청역 푸르지오 에듀포레" });
}

describe("상세 — 미분양 수 비공개", () => {
  it("머리 줄에 회색 '미분양 수 비공개(대구시)'", async () => {
    await renderWith(detail({ unsold_hidden: true, unsold_listed_as_of: "2026-09-30" }));
    const label = screen.getByText("미분양 수 비공개(대구시)");
    expect(label.className).toContain("text-gray-400");
    expect(screen.queryByText(/미분양 \d+세대/)).not.toBeInTheDocument();
  });

  it("추이 절에는 안내 한 문장만 — 추정치 문장 없음", async () => {
    await renderWith(detail({ unsold_hidden: true, unsold_listed_as_of: "2026-09-30" }));
    const notice = await screen.findByTestId("mb-unsold-hidden-notice");
    expect(notice.textContent).toBe("대구시 9월 말 명단은 이 단지의 미분양 수를 공개하지 않습니다.");
  });

  it("옛 추정 점이 있어도 그래프·엑셀 단추를 그리지 않는다", async () => {
    await renderWith(detail({ unsold_hidden: true, unsold_listed_as_of: "2026-09-30" }));
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    await screen.findByTestId("mb-unsold-hidden-notice");
    // 추이 응답이 다 풀린 뒤에도 그래프·단추가 끝내 안 나오는지 — 응답 전 '없음'을 잘못 통과하지 않게 한 박자 기다린다
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("mb-unsold-chart-stub")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "엑셀" })).not.toBeInTheDocument();
  });
});

describe("상세 — 비공개가 아니면 그래프·엑셀 그대로", () => {
  it("숫자 있는 단지는 추이 그래프와 엑셀 단추가 보인다", async () => {
    await renderWith(detail({ unsold: 25, unsold_hidden: false, unsold_listed_as_of: "2026-09-30" }));
    expect(await screen.findByTestId("mb-unsold-chart-stub")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "엑셀" })).toBeInTheDocument();
  });
});

describe("상세 — 옛 서버 응답(칸 없음)은 지금과 같다", () => {
  it("머리 줄·안내 줄 모두 없음", async () => {
    await renderWith(detail());
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(screen.queryByText(/비공개/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("mb-unsold-hidden-notice")).not.toBeInTheDocument();
  });

  it("숫자 있는 단지는 지금 그대로 '미분양 25세대'", async () => {
    await renderWith(detail({ unsold: 25, unsold_hidden: false, unsold_listed_as_of: "2026-09-30" }));
    expect(screen.getByText("미분양 25세대")).toBeInTheDocument();
    expect(screen.queryByTestId("mb-unsold-hidden-notice")).not.toBeInTheDocument();
  });
});
