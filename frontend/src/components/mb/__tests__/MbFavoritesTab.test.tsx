/**
 * MbFavoritesTab 테스트 — 즐겨찾기 해제 시 selected 유령 id 정리 (세션 297)
 * 버그: 해제 후 selected Set 미정리 → 선택 카운트 어긋남 + '선택 비교' URL 에 유령 id
 * 실행: npx vitest run src/components/mb/__tests__/MbFavoritesTab.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import MbFavoritesTab from "../MbFavoritesTab";

function makeFav(id: string, name: string) {
  return { id, name, region: "서울", added_at: Date.now() };
}

beforeEach(() => {
  push.mockClear();
});

describe("MbFavoritesTab — selected 유령 id 정리", () => {
  it("선택한 단지가 즐겨찾기에서 빠지면 선택 카운트도 줄고 '선택 비교'가 비활성화된다", () => {
    const favs = [makeFav("A", "단지A"), makeFav("B", "단지B")];
    const { rerender } = render(<MbFavoritesTab favorites={favs} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("단지A 선택"));
    fireEvent.click(screen.getByLabelText("단지B 선택"));
    expect(screen.getByText("2/4개 선택")).toBeInTheDocument();

    // 단지B 즐겨찾기 해제 (부모 favorites prop 변화 시뮬레이션)
    rerender(<MbFavoritesTab favorites={[makeFav("A", "단지A")]} onRemove={vi.fn()} />);

    expect(screen.getByText("1/4개 선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 비교" })).toBeDisabled();
  });

  it("해제 후 '선택 비교' URL 에 유령 id 가 포함되지 않는다", () => {
    const favs = [makeFav("A", "단지A"), makeFav("B", "단지B"), makeFav("C", "단지C")];
    const { rerender } = render(<MbFavoritesTab favorites={favs} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("단지A 선택"));
    fireEvent.click(screen.getByLabelText("단지B 선택"));
    fireEvent.click(screen.getByLabelText("단지C 선택"));

    // 단지B 해제 → A, C 만 남음
    rerender(
      <MbFavoritesTab
        favorites={[makeFav("A", "단지A"), makeFav("C", "단지C")]}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 비교" }));
    expect(push).toHaveBeenCalledWith("/mibunyang/compare?ids=A,C");
  });

  it("즐겨찾기 변화가 선택과 무관하면 selected 가 그대로 유지된다", () => {
    const favs = [makeFav("A", "단지A"), makeFav("B", "단지B"), makeFav("C", "단지C")];
    const { rerender } = render(<MbFavoritesTab favorites={favs} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("단지A 선택"));
    fireEvent.click(screen.getByLabelText("단지B 선택"));

    // 선택 안 한 단지C 만 해제
    rerender(
      <MbFavoritesTab
        favorites={[makeFav("A", "단지A"), makeFav("B", "단지B")]}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("2/4개 선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 비교" })).toBeEnabled();
  });

  it("빈 즐겨찾기면 빈 상태 카피가 보인다", () => {
    render(<MbFavoritesTab favorites={[]} onRemove={vi.fn()} />);
    expect(screen.getByText("즐겨찾기한 단지가 없습니다")).toBeInTheDocument();
  });
});
