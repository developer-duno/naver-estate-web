/**
 * /tools/brokerage-fee 푸터 안내 링크 회귀 가드
 * 푸터가 /tools 허브 + /blog 안내 글 두 링크를 정확한 href 로 안내하는지 검증.
 * (세션 286 — "출시 일정" 구식 문구 제거 후 재구식화 방지 가드)
 * 실행: npx vitest run src/app/tools/brokerage-fee/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BrokerageFeeToolPage from "../page";

describe("/tools/brokerage-fee 푸터 안내", () => {
  it("계산기 모음 링크가 /tools 허브를 가리킨다", () => {
    render(<BrokerageFeeToolPage />);
    expect(screen.getByRole("link", { name: "계산기 모음" })).toHaveAttribute(
      "href",
      "/tools",
    );
  });

  it("계산기 안내 글 링크가 /blog/realestate-calculators 를 가리킨다", () => {
    render(<BrokerageFeeToolPage />);
    expect(screen.getByRole("link", { name: "계산기 안내 글" })).toHaveAttribute(
      "href",
      "/blog/realestate-calculators",
    );
  });
});
