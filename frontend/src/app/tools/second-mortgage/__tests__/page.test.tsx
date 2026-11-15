/**
 * /tools/second-mortgage 장 시험(세션 508) — 제목·자기 주소 메타·바닥 안내 링크
 * 실행: npx vitest run src/app/tools/second-mortgage/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SecondMortgageToolPage, { metadata } from "../page";

describe("/tools/second-mortgage", () => {
  it("h1 과 계산기를 그린다", () => {
    render(<SecondMortgageToolPage />);
    expect(screen.getByRole("heading", { level: 1, name: "후순위 대출 한도 계산기" })).toBeInTheDocument();
    expect(screen.getByLabelText("우리 집 시세")).toBeInTheDocument();
  });

  it("canonical·og:url 이 자기 주소이고 og 그림을 명시한다(seo-metadata 룰 2·6)", () => {
    expect(metadata.alternates?.canonical).toBe("/tools/second-mortgage");
    const og = metadata.openGraph as { url?: string; images?: unknown[] };
    expect(og.url).toBe("/tools/second-mortgage");
    expect(og.images).toHaveLength(1);
  });

  it("바닥 링크가 계산기 모음·불법 대출 광고 글을 가리킨다", () => {
    render(<SecondMortgageToolPage />);
    expect(screen.getByRole("link", { name: "계산기 모음" })).toHaveAttribute("href", "/tools");
    expect(screen.getByRole("link", { name: "불법 대출 광고 거르는 법" })).toHaveAttribute(
      "href",
      "/blog/illegal-loan-filter",
    );
  });
});
