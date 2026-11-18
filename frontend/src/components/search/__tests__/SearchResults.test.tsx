/**
 * SearchResults — 검색 결과 20곳씩 + 「더 보기 · n / N」 + 펼친 수 되살리기 + 매물수 칸 판정(세션 525 · B40 PR 2a)
 * (가) 처음 20 · 누르면 40 · 끝에서 단추 없음 · N ≤ 20 이면 단추 없음 · 표와 카드가 같은 수
 * (나) 같은 목록 이름으로 다시 그리면 세션 저장소의 펼친 수를 되살린다
 * (다) 목록 이름(검색어·지역·유형·정렬)이 바뀌면 20 으로
 * (라) 매물수 칸은 자료에 매물 수가 있을 때만 — 비로그인 자료(칸 없음)엔 머리칸 9 · 로그인 자료 10 · 빈 「-」 없음
 * 실행: npx vitest run src/components/search/__tests__/SearchResults.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SearchResults, { SEARCH_PAGE_SIZE, SEARCH_SHOWN_STORE } from "../SearchResults";
import type { Complex } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

/** 시험 단지 n곳 — withArticles 면 로그인 응답처럼 매물 수가 있다 */
function makeComplexes(n: number, withArticles = false): Complex[] {
  return Array.from({ length: n }, (_, i) => {
    const no = String(i + 1).padStart(3, "0");
    return {
      complex_no: `9${no}`,
      complex_name: `시험단지 ${no}`,
      real_estate_type_name: "아파트",
      cortar_address: "서울시 서초구 반포동",
      total_household_count: 1000 + i,
      use_approve_ymd: "20100101",
      ...(withArticles ? { article_count: i % 3 } : {}),
    } as Complex;
  });
}

function renderList(complexes: Complex[], listKey = "q=래미안", hidden = false) {
  return render(
    <TestQueryProvider>
      <SearchResults complexes={complexes} listKey={listKey} hidden={hidden} isInCompare={() => false} compareFull={false} onToggleCompare={vi.fn()} />
    </TestQueryProvider>,
  );
}

/** 표 줄 수 · 카드 수 */
function counts(container: HTMLElement) {
  return {
    rows: container.querySelectorAll("tbody tr").length,
    cards: container.querySelectorAll('[data-testid="complex-card"]').length,
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("SearchResults — 20곳씩 더 보기", () => {
  it("(가) 236곳: 처음 20 · 「더 보기 · 20 / 236」 · 누르면 40 · 끝까지 누르면 단추 없음", () => {
    const { container } = renderList(makeComplexes(236));
    expect(counts(container)).toEqual({ rows: 20, cards: 20 });
    const btn = screen.getByRole("button", { name: "더 보기 · 20 / 236" });
    fireEvent.click(btn);
    expect(counts(container)).toEqual({ rows: 40, cards: 40 });
    expect(screen.getByRole("button", { name: "더 보기 · 40 / 236" })).toBeInTheDocument();
    // 끝까지 — 줄이 많아 역할 찾기(getByRole)는 느리다 → 글자로 찾는다
    for (let i = 0; i < 20; i++) {
      const b = screen.queryByText(/^더 보기 ·/);
      if (!b) break;
      fireEvent.click(b);
    }
    expect(counts(container)).toEqual({ rows: 236, cards: 236 });
    expect(screen.queryByText(/더 보기/)).not.toBeInTheDocument();
  }, 20_000);

  it("(가-2) 20곳 이하면 단추가 없다 · 21곳이면 있다", () => {
    const { unmount } = renderList(makeComplexes(SEARCH_PAGE_SIZE));
    expect(screen.queryByRole("button", { name: /더 보기/ })).not.toBeInTheDocument();
    unmount();
    renderList(makeComplexes(21));
    expect(screen.getByRole("button", { name: "더 보기 · 20 / 21" })).toBeInTheDocument();
  });

  it("(나) 단지 장에 갔다 돌아오면(다시 그리기) 펼친 60곳을 되살린다", () => {
    const first = renderList(makeComplexes(236), "q=래미안|types=");
    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(counts(first.container).cards).toBe(60);
    first.unmount();
    expect(JSON.parse(sessionStorage.getItem(SEARCH_SHOWN_STORE) ?? "{}")).toEqual({ "q=래미안|types=": 60 });
    const again = renderList(makeComplexes(236), "q=래미안|types=");
    expect(counts(again.container)).toEqual({ rows: 60, cards: 60 });
    expect(screen.getByRole("button", { name: "더 보기 · 60 / 236" })).toBeInTheDocument();
  });

  it("(다) 목록 이름이 바뀌면 20 으로 · 다른 목록의 펼친 수는 따로 둔다", () => {
    const r = renderList(makeComplexes(236), "q=래미안");
    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(counts(r.container).cards).toBe(40);
    r.rerender(
      <TestQueryProvider>
        <SearchResults complexes={makeComplexes(236)} listKey="q=힐스" hidden={false} isInCompare={() => false} compareFull={false} onToggleCompare={vi.fn()} />
      </TestQueryProvider>,
    );
    expect(counts(r.container).cards).toBe(20);
    r.rerender(
      <TestQueryProvider>
        <SearchResults complexes={makeComplexes(236)} listKey="q=래미안" hidden={false} isInCompare={() => false} compareFull={false} onToggleCompare={vi.fn()} />
      </TestQueryProvider>,
    );
    expect(counts(r.container).cards).toBe(40);
  });

  it("지도 보기(hidden)여도 목록은 붙여 둔 채 숨기고 단추도 숨긴다", () => {
    const { container } = renderList(makeComplexes(236), "q=래미안", true);
    expect(counts(container)).toEqual({ rows: 20, cards: 20 });
    container.querySelectorAll('[data-testid="complex-card"]').forEach((c) => expect(c.closest("div.hidden")).not.toBeNull());
    expect(screen.getByRole("button", { name: /더 보기/ }).className.split(/\s+/)).toContain("hidden");
  });
});

describe("SearchResults — 매물수 칸", () => {
  it("(라) 비로그인 자료(매물 수 없음): 머리칸 9 · 매물수 칸 없음 · 목록에 「-」 단독 글자 없음", () => {
    const { container } = renderList(makeComplexes(5));
    const ths = Array.from(container.querySelectorAll("thead th")).map((t) => t.textContent);
    expect(ths).toHaveLength(9);
    expect(ths).not.toContain("매물수");
    const dashes = Array.from(container.querySelectorAll("tbody *, [data-testid='complex-card'] *")).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === "-",
    );
    expect(dashes).toHaveLength(0);
    expect(screen.queryByText(/^매물 \d+건/)).not.toBeInTheDocument();
  });

  it("로그인 자료(매물 수 있음): 머리칸 10 · 매물수 칸 · 카드 셋째 줄 「매물 N건」", () => {
    const { container } = renderList(makeComplexes(5, true));
    const ths = Array.from(container.querySelectorAll("thead th")).map((t) => t.textContent);
    expect(ths).toHaveLength(10);
    expect(ths).toContain("매물수");
    expect(screen.getAllByText("매물 1건").length).toBeGreaterThan(0);
  });
});
