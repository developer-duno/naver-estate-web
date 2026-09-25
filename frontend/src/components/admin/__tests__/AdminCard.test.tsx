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

  /** aria-controls 는 가리킬 설명 문단이 DOM 에 있을 때(열림)만 단다 — 닫힘 땐 없는 id 참조가 되므로 */
  it("ⓘ 버튼의 aria-controls 는 열렸을 때만 있고, 그때 설명 문단의 id 를 가리킨다", () => {
    render(
      <AdminCard title="도움말 카드" help="연결 확인용 설명">
        <p>body</p>
      </AdminCard>,
    );
    const btn = screen.getByRole("button", { name: "설명 보기" });
    expect(btn).not.toHaveAttribute("aria-controls");

    fireEvent.click(btn);
    const controls = btn.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toHaveTextContent("연결 확인용 설명");

    fireEvent.click(btn);
    expect(btn).not.toHaveAttribute("aria-controls");
  });

  /** hideTitle: 대시보드 접힌 절 안에서 절 제목과 두 줄로 겹치지 않게 제목(h3)만 뺀다.
   *  도움말(ⓘ)·action·본문은 그대로 남아야 한다 */
  it("hideTitle 이면 제목 h3 를 그리지 않되 ⓘ·action·본문은 남는다", () => {
    render(
      <AdminCard title="숨길 제목" help="숨김 카드 설명" action={<button>새로고침</button>} hideTitle>
        <p>본문 그대로</p>
      </AdminCard>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("숨길 제목")).toBeNull();
    expect(screen.getByText("본문 그대로")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "설명 보기" });
    fireEvent.click(btn);
    expect(screen.getByText("숨김 카드 설명")).toBeInTheDocument();
  });

  /** hideTitle 인데 help·action 이 모두 없으면 빈 머리줄(여백)을 만들지 않고 본문만 */
  it("hideTitle + help·action 없음이면 본문만 그린다", () => {
    const { container } = render(
      <AdminCard title="숨길 제목" hideTitle>
        <p>본문만</p>
      </AdminCard>,
    );
    const card = container.firstElementChild!;
    expect(card.children).toHaveLength(1);
    expect(card.firstElementChild).toHaveTextContent("본문만");
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
