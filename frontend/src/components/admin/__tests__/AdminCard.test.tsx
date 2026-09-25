/**
 * AdminCard 컴포넌트 테스트 — 관리자 화면 공통 헤더+본문 카드
 * 실행: npx vitest run src/components/admin/__tests__/AdminCard.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  /** help prop: 도움말은 기본 접힘 — ⓘ 버튼을 눌러야 보인다 (세션 419, 사장님 "난잡하다").
   *  문구는 지우지 않고(운영 지식) 조건부 렌더로 숨긴다 — 닫힌 동안 DOM 에 없어 스크린리더도 조용. */
  it("help 는 기본 숨김이고 ⓘ 버튼을 누르면 보이며 다시 누르면 숨는다", () => {
    render(
      <AdminCard title="도움말 카드" help="이건 도움말 텍스트입니다">
        <p>body</p>
      </AdminCard>,
    );
    const btn = screen.getByRole("button", { name: "설명 보기" });
    // 열기 전: 문구 없음 + aria-expanded=false
    expect(screen.queryByText("이건 도움말 텍스트입니다")).toBeNull();
    expect(btn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(btn);
    expect(screen.getByText("이건 도움말 텍스트입니다")).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(btn);
    expect(screen.queryByText("이건 도움말 텍스트입니다")).toBeNull();
  });

  /** 버튼이 제목(h3) 밖에 있어 제목의 접근 이름에 "설명 보기"가 섞이지 않는다 */
  it("help 가 있어도 제목 heading 의 이름은 제목 그대로다", () => {
    render(
      <AdminCard title="도움말 카드" help="설명">
        <p>body</p>
      </AdminCard>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "도움말 카드" })).toBeInTheDocument();
  });

  /** help 미지정: ⓘ 버튼 미렌더 */
  it("help 미지정 시 ⓘ 미렌더", () => {
    render(
      <AdminCard title="기본 카드">
        <p>body</p>
      </AdminCard>,
    );
    expect(screen.queryByText("ⓘ")).toBeNull();
  });
});
