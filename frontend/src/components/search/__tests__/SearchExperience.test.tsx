/**
 * SearchExperience 통합 테스트 — 지도 뷰 토글이 만드는 신규 동작만 최소 검증.
 * (SearchExperience 자체는 기존에 테스트 파일이 0건이었음 — 적대검증에서 발견,
 * 계획 문서 §4단계 참고. 전체 커버리지 신설이 아니라 이번 기능이 추가한 동작만 검증.)
 *
 * 실행: npx vitest run src/components/search/__tests__/SearchExperience.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchExperience from "../SearchExperience";
import type { Complex } from "@/types";

// next/navigation 은 전역 test-setup 에서 이미 mock 되어 있으나(빈 URLSearchParams),
// 이 테스트는 검색 결과가 실제로 뜨는 상태(hasSearchParams=true)가 필요해 재정의.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("q=래미안"),
  useParams: () => ({}),
}));

// vi.mock 은 파일 최상단으로 호이스팅되므로, mock 팩토리 안에서 참조할 데이터는
// vi.hoisted() 로 감싸야 한다(일반 const 는 호이스팅 안 돼 ReferenceError).
const { mockComplex } = vi.hoisted(() => ({
  mockComplex: {
    complex_no: "101",
    complex_name: "래미안테스트",
    latitude: 37.5,
    longitude: 127.0,
    article_count: 5,
  } satisfies Complex,
}));

vi.mock("@/lib/api", () => ({
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [mockComplex], total: 1 }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [mockComplex], total: 1 }),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}));

// next/dynamic 은 전역 test-setup.ts 가 "항상 null 렌더"로 대체한다(프로젝트 전역 관례).
// 즉 SearchClusterMap 이 실제로 화면에 그려지는지는 단위 테스트로 검증 불가 — 완전
// 지연 로드가 브라우저에서 실제로 동작하는지는 계획 문서 §검증(devtools Network 탭
// 실측)의 몫이고, "dynamic(ssr:false)로 배선돼 있다"는 사실은 파일 하단 정적 검사로 확인.

// MAP_ENABLED=true 여야 MbViewToggle 이 렌더된다.
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return { ...actual, MAP_ENABLED: true };
});

function renderSearchExperience() {
  return render(
    <TestQueryProvider>
      <SearchExperience />
    </TestQueryProvider>,
  );
}

describe("SearchExperience — 지도 뷰 토글 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("초기 렌더는 목록 뷰가 기본값 — 지도(map) 탭이 선택되지 않은 상태", async () => {
    renderSearchExperience();
    // 데스크톱 테이블(hidden md:block)·모바일 카드(md:hidden) 둘 다 CSS 로만 숨겨져
    // jsdom 에는 동시에 존재 — getAllByText 로 최소 1개 이상 렌더됐는지 확인.
    await waitFor(() => {
      expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("tab", { name: "목록" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "지도" })).toHaveAttribute("aria-selected", "false");
  });

  it("지도 토글 클릭 시 아코디언 상태가 전환된다 (viewMode=map)", async () => {
    renderSearchExperience();
    await waitFor(() => {
      expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0);
    });

    const mapTab = screen.getByRole("tab", { name: "지도" });
    fireEvent.click(mapTab);

    await waitFor(() => {
      expect(mapTab).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("tab", { name: "목록" })).toHaveAttribute("aria-selected", "false");
  });

  it("지도 모드로 바꿔도 목록은 언마운트되지 않고 hidden 으로만 숨는다 (INP 회귀 가드)", async () => {
    // 근본 배경(세션 351 라이브 트레이스 실측): 지도 탭 클릭 INP 2,647ms 의 진범은
    // 클러스터링이 아니라 목록 500행을 React 가 해체하는 비용이었다(removeChild 자기시간
    // 1,477ms + 커밋 트리 순회 1,147ms). 언마운트로 되돌리면 그 비용이 그대로 재발하므로,
    // "DOM 에 남아 있되 hidden" 을 구조적으로 못 박는다.
    renderSearchExperience();
    await waitFor(() => {
      expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0);
    });
    const listCountBefore = screen.getAllByText("래미안테스트").length;

    fireEvent.click(screen.getByRole("tab", { name: "지도" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "지도" })).toHaveAttribute("aria-selected", "true");
    });

    // 목록 행이 DOM 에서 사라지지 않았다 = 언마운트 안 됨(= 해체 비용 0).
    const rowsAfter = screen.getAllByText("래미안테스트");
    expect(rowsAfter.length).toBe(listCountBefore);
    // 그리고 각 행의 뷰 컨테이너는 hidden(display:none)이라 화면·접근성 트리에선 빠진다.
    rowsAfter.forEach((node) => {
      expect(node.closest("div.hidden")).not.toBeNull();
    });
  });

  it("지도 → 목록으로 되돌리면 목록이 다시 보인다 (hidden 해제)", async () => {
    renderSearchExperience();
    await waitFor(() => {
      expect(screen.getAllByText("래미안테스트").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("tab", { name: "지도" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "지도" })).toHaveAttribute("aria-selected", "true");
    });

    fireEvent.click(screen.getByRole("tab", { name: "목록" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "목록" })).toHaveAttribute("aria-selected", "true");
    });

    // 목록 뷰 컨테이너 중 최소 하나는 hidden 이 아닌 상태(모바일 카드: "md:hidden space-y-3")로
    // 돌아와야 한다 — 데스크톱 표는 원래 "hidden md:block" 이라 jsdom 에선 계속 hidden 클래스를 갖는다.
    const visibleAgain = screen
      .getAllByText("래미안테스트")
      .some((node) => node.closest("div.md\\:hidden.space-y-3") !== null);
    expect(visibleAgain).toBe(true);
  });
});

// dynamic() 호출은 SearchExperience 모듈이 처음 import 될 때 딱 1회만 일어나는
// 모듈-스코프 이벤트라 vi.clearAllMocks() 있는 describe 블록에서는 실행 순서에 따라
// spy 기록이 지워질 수 있다(런타임 mock 검증의 구조적 한계). 대신 소스 코드 자체를
// 정적으로 검사 — "SearchClusterMap 이 실제로 dynamic(ssr:false)로 감싸져 있다"는
// 배선을 실행 시점 상태와 무관하게 결정론적으로 확인한다. 실제 청크가 브라우저에서
// 언제 로드되는지는 계획 문서 §검증(devtools Network 탭 실측)의 몫.
describe("SearchExperience — SearchClusterMap 지연 로드 배선 (정적 검사)", () => {
  it("소스에 dynamic(ssr:false)로 SearchClusterMap 을 감싸는 코드가 있다", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(__dirname, "../SearchExperience.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']@\/components\/search\/SearchClusterMap["']\)/);
    expect(source).toMatch(/ssr:\s*false/);
  });
});
