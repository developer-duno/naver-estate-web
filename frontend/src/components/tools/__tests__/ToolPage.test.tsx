/**
 * 계산기 새 틀 부품 시험(세션 530 · B40 PR 3a) — ToolPage · ToolLinks · ToolNotesFold
 * 실행: npx vitest run src/components/tools/__tests__/ToolPage.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolPage from "../ToolPage";
import ToolLinks from "../ToolLinks";
import ToolNotesFold from "../ToolNotesFold";

describe("ToolPage", () => {
  it("띠에 eyebrow·h1·설명을 그리고 h1 은 하나다", () => {
    render(
      <ToolPage eyebrow="계산기 · 로그인 없이" title="시험 계산기" description="설명 한 줄">
        <div>본문</div>
      </ToolPage>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "시험 계산기" })).toBeInTheDocument();
    expect(screen.getByText("계산기 · 로그인 없이")).toBeInTheDocument();
    expect(screen.getByText("설명 한 줄")).toBeInTheDocument();
    // 첫 카드가 띠에 걸친다
    expect(screen.getByText("본문").parentElement?.className).toBe("-mt-16");
  });

  it("links 를 안 주면 바닥에 아무것도 없다(계산기 모음 장)", () => {
    render(
      <ToolPage title="모음">
        <div>본문</div>
      </ToolPage>,
    );
    const overlap = screen.getByText("본문").parentElement!;
    expect(overlap.nextSibling).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("links 를 주면 카드 아래에 그린다", () => {
    render(
      <ToolPage title="후순위" links={<ToolLinks current="second-mortgage" />}>
        <div>본문</div>
      </ToolPage>,
    );
    expect(screen.getByText("본문").parentElement!.nextSibling).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

describe("ToolLinks", () => {
  it("후순위 장 = 지금의 두 링크(계산기 모음 · 불법 대출 광고 거르는 법) 그대로", () => {
    render(<ToolLinks current="second-mortgage" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/tools", "/blog/illegal-loan-filter"]);
    expect(screen.getByRole("link", { name: "계산기 모음" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "불법 대출 광고 거르는 법" })).toBeInTheDocument();
  });

  it("세금 장 = 자기 자신을 뺀 칩 4 + 계산기 모음 + 계산기 안내 글, 후순위 칩 없음", () => {
    render(<ToolLinks current="acquisition-tax" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/tools/brokerage-fee",
      "/tools/transfer-tax",
      "/tools/property-tax",
      "/tools/area-converter",
      "/tools",
      "/blog/realestate-calculators",
    ]);
    expect(hrefs).not.toContain("/tools/acquisition-tax");
    expect(hrefs).not.toContain("/tools/second-mortgage");
  });
});

describe("ToolNotesFold", () => {
  it("닫힌 채로 시작하고 안의 글은 DOM 에 있다 · 요약에 개수를 적는다", () => {
    render(
      <ToolNotesFold count={3}>
        <p>계산 기준 글</p>
      </ToolNotesFold>,
    );
    const details = screen.getByTestId("tool-notes-fold") as HTMLDetailsElement;
    expect(details.tagName).toBe("DETAILS");
    expect(details.open).toBe(false);
    expect(screen.getByText("계산 기준과 주의할 점 (3)")).toBeInTheDocument();
    expect(details).toContainElement(screen.getByText("계산 기준 글"));
  });
});
