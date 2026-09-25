/**
 * RawDetail 테스트 — 휴대폰에서도 원문을 볼 수 있게 누르면 펼치는 "원문 보기" (세션 419)
 * 실행: npx vitest run src/components/admin/__tests__/RawDetail.test.tsx
 *
 * 옛 방식(title 속성)은 마우스를 올려야만 보여 휴대폰에서는 원문을 볼 길이 없었다.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RawDetail from "../RawDetail";

describe("RawDetail", () => {
  it("처음엔 접혀 있어 원문이 화면에 없고, 누르면 원문이 보이고, 다시 누르면 접힌다", () => {
    render(<RawDetail raw="psycopg2.OperationalError: timeout" />);

    // 접힘 기본 — 원문은 DOM 에 없다
    expect(screen.queryByText("psycopg2.OperationalError: timeout")).not.toBeInTheDocument();
    const summary = screen.getByText("원문 보기");
    // 데스크톱 마우스 미리보기용 title 은 유지
    expect(summary.closest("summary")).toHaveAttribute("title", "psycopg2.OperationalError: timeout");

    fireEvent.click(summary);
    expect(screen.getByText("psycopg2.OperationalError: timeout")).toBeInTheDocument();
    expect(screen.getByText("원문 접기")).toBeInTheDocument();
    expect(summary.closest("details")).toHaveAttribute("open");

    fireEvent.click(screen.getByText("원문 접기"));
    expect(screen.queryByText("psycopg2.OperationalError: timeout")).not.toBeInTheDocument();
  });

  it("children 을 주면 그 글자를 그대로 누를 거리로 쓰고(접힌 모양 불변), 누르면 원문이 보인다", () => {
    render(
      <RawDetail raw="article_detail">
        <span title="article_detail">매물 상세 가져오기</span>
      </RawDetail>,
    );
    // "원문 보기" 글자가 새로 생기지 않는다 — 대시보드 사진이 안 바뀌는 근거
    expect(screen.queryByText("원문 보기")).not.toBeInTheDocument();
    expect(screen.queryByText("article_detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("매물 상세 가져오기"));
    expect(screen.getByText("article_detail")).toBeInTheDocument();
  });

  it("누름을 바깥(행 전체를 누르면 펼쳐지는 표)으로 올려 보내지 않는다", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <RawDetail raw="https://example.invalid/api" />
      </div>,
    );
    fireEvent.click(screen.getByText("원문 보기"));
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByText("https://example.invalid/api")).toBeInTheDocument();
  });

  it("원문이 비어 있으면 누를 거리 없이 children 만 그린다", () => {
    const { container } = render(
      <RawDetail raw="">
        <span>이름만</span>
      </RawDetail>,
    );
    expect(screen.getByText("이름만")).toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();

    const { container: c2 } = render(<RawDetail raw={null} />);
    expect(c2.innerHTML).toBe("");
  });
});
