/**
 * MbPresaleTab 테스트 (세션 314 PR C) — 세그먼트 전환 + presale/competition 분기 렌더.
 * 실행: npx vitest run src/components/mb/__tests__/MbPresaleTab.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { MbApartment } from "@/types";
import { TestQueryProvider } from "@/test-setup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/mibunyang",
  useSearchParams: () => new URLSearchParams(),
}));

import MbPresaleTab from "../MbPresaleTab";

function makeApt(o: Partial<MbApartment> & { id: string; name: string }): MbApartment {
  return { region: "서울", gu: "강남", ...o };
}

// 최소 UseQueryResult mock (success 상태)
function okQuery<T>(data: T): UseQueryResult<T> {
  return {
    data, isLoading: false, isError: false, error: null, refetch: vi.fn(),
  } as unknown as UseQueryResult<T>;
}

const presaleData = { presale: [makeApt({ id: "P", name: "민간단지", presale_type: "민간분양" })], total: 1, page: 1, page_size: 10 };
const competitionData = { competition: [makeApt({ id: "C", name: "경쟁단지", competition_rate: 20 })], total: 1, page: 1, page_size: 10 };

function renderTab(segment: "private" | "public" | "competition", onSegmentChange = vi.fn()) {
  // 세션 319: 지도뷰 인프라 lazy fetch(useQuery) 추가로 QueryClientProvider 필요 (web-rules.md).
  return render(
    <TestQueryProvider>
      <MbPresaleTab
        segment={segment}
        onSegmentChange={onSegmentChange}
        presaleQuery={okQuery(presaleData)}
        competitionQuery={okQuery(competitionData)}
        page={1}
        sort=""
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        isInCompare={() => false}
        onCompareToggle={vi.fn()}
        compareFull={false}
      />
    </TestQueryProvider>,
  );
}

describe("MbPresaleTab — 세그먼트 전환", () => {
  it("세그먼트 3종(민간분양/LH공공분양/분양결과) 버튼이 렌더된다", () => {
    renderTab("private");
    expect(screen.getByRole("tab", { name: "민간분양" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "LH공공분양" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "분양결과" })).toBeInTheDocument();
  });

  it("private 세그먼트는 presale 데이터(분양 테이블)를 렌더", () => {
    renderTab("private");
    expect(screen.getAllByText("민간단지").length).toBeGreaterThanOrEqual(1);
    // 분양 테이블 헤더
    expect(screen.getByText("분양가(최저)")).toBeInTheDocument();
  });

  it("competition 세그먼트는 분양결과 테이블(접수자수 컬럼)을 렌더", () => {
    renderTab("competition");
    expect(screen.getAllByText("경쟁단지").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("접수자수")).toBeInTheDocument();
  });

  it("세그먼트 버튼 클릭 시 onSegmentChange 호출", () => {
    const onSeg = vi.fn();
    renderTab("private", onSeg);
    fireEvent.click(screen.getByRole("tab", { name: "분양결과" }));
    expect(onSeg).toHaveBeenCalledWith("competition");
  });

  it("선택된 세그먼트는 aria-selected=true", () => {
    renderTab("public");
    expect(screen.getByRole("tab", { name: "LH공공분양" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "민간분양" })).toHaveAttribute("aria-selected", "false");
  });
});
