/**
 * AdminCard 컴포넌트 테스트 — 관리자 화면 공통 헤더+본문 카드
 * 실행: npx vitest run src/components/admin/__tests__/AdminCard.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminCard from "../AdminCard";

describe("AdminCard", () => {
  /** 기본 렌더: title 이 h3 로 렌더되고 children 이 본문에 노출되는지 */
  it("title 을 h3 로, children 을 본문으로 렌더한다", () => {
    render(
      <AdminCard title="테스트 타이틀">
        <p>본문 내용</p>
      </AdminCard>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "테스트 타이틀" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("본문 내용")).toBeInTheDocument();
  });

  /** action prop: 우측 액션 노드가 헤더 영역에 함께 렌더되는지 */
  it("action prop 이 헤더에 함께 렌더된다", () => {
    render(
      <AdminCard title="카드" action={<button>새로고침</button>}>
        <p>body</p>
      </AdminCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "카드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
  });

  /** action 미제공: heading 만 렌더되고 추가 요소는 없음 */
  it("action 미제공 시 heading 만 렌더되고 UI 오류 없음", () => {
    render(
      <AdminCard title="액션 없음">
        <span>only body</span>
      </AdminCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "액션 없음" })).toBeInTheDocument();
    expect(screen.getByText("only body")).toBeInTheDocument();
    // 버튼/링크 없음 보장
    expect(screen.queryByRole("button")).toBeNull();
  });

  /** help prop: ⓘ 아이콘 + 항상 보이는 회색 캡션이 함께 렌더 */
  it("help prop 이 있으면 ⓘ 아이콘 + 캡션 텍스트 항상 표시", () => {
    render(
      <AdminCard title="도움말 카드" help="이건 도움말 텍스트입니다">
        <p>body</p>
      </AdminCard>,
    );
    const helpIcon = screen.getByRole("img", { name: "이건 도움말 텍스트입니다" });
    expect(helpIcon).toBeInTheDocument();
    expect(helpIcon.textContent).toBe("ⓘ");
    // 캡션이 항상 보이는 회색 텍스트로 함께 렌더 (hover 없이도 즉시 확인 가능)
    expect(screen.getByText("이건 도움말 텍스트입니다")).toBeInTheDocument();
  });

  /** help 미지정: ⓘ 아이콘 미렌더 */
  it("help 미지정 시 ⓘ 아이콘 미렌더", () => {
    render(
      <AdminCard title="기본 카드">
        <p>body</p>
      </AdminCard>,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });
});
