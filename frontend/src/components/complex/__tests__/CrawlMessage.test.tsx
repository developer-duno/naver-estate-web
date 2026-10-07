/**
 * CrawlMessage 한 줄 안내 회귀 가드 (세션 447)
 *
 * 진행·완료·쿨다운·오류를 "매물 N건" 줄 안의 같은 자리에 한 줄로 띄운다.
 * 표 위 큰 상자(CrawlProgressBanner — 단계 표시 "매물 목록 받기" 등)는 더 이상 그리지 않는다.
 *
 * 실행: npx vitest run src/components/complex/__tests__/CrawlMessage.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CrawlMessage from "../CrawlMessage";
import type { CrawlProgress } from "@/types";

function makeProgress(over: Partial<CrawlProgress>): CrawlProgress {
  return { complex_no: "100", status: "running", ...over };
}

function renderMsg(props: Partial<React.ComponentProps<typeof CrawlMessage>> = {}) {
  return render(
    <CrawlMessage
      crawling={false}
      message=""
      messageType="info"
      progress={null}
      onClear={() => {}}
      {...props}
    />,
  );
}

describe("CrawlMessage — 진행 중 한 줄 글", () => {
  it("목록 받는 중: '네이버에서 지금 매물 받는 중 · 12건'", () => {
    renderMsg({ crawling: true, progress: makeProgress({ phase: "articles", article_count: 12, current_page: 1 }) });
    expect(screen.getByRole("status")).toHaveTextContent("네이버에서 지금 매물 받는 중 · 12건");
  });

  it("목록 받는 중인데 아직 0건이면 건수 없이", () => {
    renderMsg({ crawling: true, progress: makeProgress({ phase: "articles", article_count: 0 }) });
    expect(screen.getByRole("status")).toHaveTextContent(/^네이버에서 지금 매물 받는 중$/);
  });

  it("상세 받는 중: '매물 상세 받는 중 · 3/10' — 총수 없으면 '매물 상세 받는 중'", () => {
    const { rerender } = renderMsg({
      crawling: true,
      progress: makeProgress({ phase: "details", detail_crawled_count: 3, detail_total: 10 }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("매물 상세 받는 중 · 3/10");

    rerender(
      <CrawlMessage
        crawling
        message=""
        messageType="info"
        progress={makeProgress({ phase: "details", detail_crawled_count: 0, detail_total: 0 })}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^매물 상세 받는 중$/);
  });

  it("보강 단계: '단지 정보 보강 중'", () => {
    renderMsg({ crawling: true, progress: makeProgress({ phase: "enriching" }) });
    expect(screen.getByRole("status")).toHaveTextContent("단지 정보 보강 중");
  });

  it("progress 가 아직 없으면 훅이 넘긴 문구를 쓴다", () => {
    renderMsg({ crawling: true, message: "이미 크롤링이 진행 중입니다." });
    expect(screen.getByRole("status")).toHaveTextContent("이미 크롤링이 진행 중입니다.");
  });

  it("낡은 자료면 나이 안내를 앞에 붙인다 — 값 없음이면 '저장된 자료가 오래됐어요' (세션 447 2-5)", () => {
    const { rerender } = renderMsg({
      crawling: true,
      staleLabel: "5일 전 자료예요",
      progress: makeProgress({ phase: "articles", article_count: 12 }),
    });
    expect(screen.getByRole("status")).toHaveTextContent("5일 전 자료예요 · 네이버에서 지금 매물 받는 중 · 12건");

    rerender(
      <CrawlMessage
        crawling
        message="네이버에서 지금 매물 받는 중"
        messageType="info"
        progress={null}
        onClear={() => {}}
        staleLabel="저장된 자료가 오래됐어요"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^저장된 자료가 오래됐어요 · 네이버에서 지금 매물 받는 중$/);
  });

  it("큰 상자(단계 표시)는 그리지 않고, 글은 한 줄 말줄임", () => {
    renderMsg({ crawling: true, progress: makeProgress({ phase: "details", detail_crawled_count: 3, detail_total: 10 }) });
    expect(screen.queryByText("매물 목록 받기")).not.toBeInTheDocument();
    expect(screen.queryByText("매물 상세 받기")).not.toBeInTheDocument();
    const text = screen.getByText("매물 상세 받는 중 · 3/10");
    expect(text).toHaveClass("truncate");
    expect(text).toHaveAttribute("title", "매물 상세 받는 중 · 3/10");
  });
});

describe("CrawlMessage — 끝·오류 안내도 같은 자리", () => {
  it("완료: 초록 한 줄 '갱신 완료', 닫기 버튼 없음", () => {
    renderMsg({ message: "갱신 완료", messageType: "success" });
    const text = screen.getByText("갱신 완료");
    expect(text.parentElement).toHaveClass("bg-green-50");
    expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
  });

  it("쿨다운: '10분 전 갱신됨' 그대로", () => {
    renderMsg({ message: "10분 전 갱신됨", messageType: "success" });
    expect(screen.getByText("10분 전 갱신됨")).toBeInTheDocument();
  });

  it("오류: 빨강 + × 누르면 onClear", () => {
    const onClear = vi.fn();
    renderMsg({ message: "일일 크롤링 한도를 초과했습니다.", messageType: "error", onClear });
    expect(screen.getByText("일일 크롤링 한도를 초과했습니다.").parentElement).toHaveClass("bg-red-50");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("안내가 없고 표만 다시 받는 중이면 '갱신 중'(매물 갱신 중) 하나만", () => {
    renderMsg({ tableLoading: true });
    expect(screen.getByRole("status", { name: "매물 갱신 중" })).toHaveTextContent("갱신 중");
  });

  it("안내가 있으면 '갱신 중' 표시와 겹치지 않고 안내만", () => {
    renderMsg({ tableLoading: true, message: "갱신 완료", messageType: "success" });
    expect(screen.getByText("갱신 완료")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "매물 갱신 중" })).not.toBeInTheDocument();
  });

  it("낡은 자료 실패 안내: 빨강 한 줄 + × 닫기 (2-7)", () => {
    renderMsg({ message: "5일 전 자료예요 — 지금은 새로 못 받았어요", messageType: "error" });
    expect(screen.getByText("5일 전 자료예요 — 지금은 새로 못 받았어요").parentElement).toHaveClass("bg-red-50");
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();
  });

  it("아무 것도 없으면 그리지 않는다", () => {
    const { container } = renderMsg();
    expect(container).toBeEmptyDOMElement();
  });
});
