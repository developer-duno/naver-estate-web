/**
 * 앱 아이콘·앱 색 (세션 509 · B36 ① — 사장님이 고른 「후보 1 · 아파트 세 동 + 주황 꺾은선」 · 앱 색 남색)
 * - /icon(32) · /apple-icon(180): 남색 바탕 · 흰 막대 3개 · 주황 꺾은선 · 「2u」 글자 없음
 * - /apple-icon 은 꽉 찬 바탕(rx 0 — 기기가 모서리를 깎음), /icon 은 둥근 사각(rx 7)
 * - manifest: theme_color #0b1f3a · 192·512 PNG 가 icons 에 있고 public/ 에 실제 파일이 있다
 * 실행: npx vitest run src/app/__tests__/app-icon-colors.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";

// ImageResponse 는 그림을 굽지 않고 받은 요소·옵션만 들고 있게 가짜로 바꾼다
vi.mock("next/og", () => ({
  ImageResponse: class {
    element: ReactElement;
    options: { width: number; height: number };
    constructor(element: ReactElement, options: { width: number; height: number }) {
      this.element = element;
      this.options = options;
    }
  },
}));

import Icon, { size as iconSize } from "../icon";
import AppleIcon, { size as appleSize } from "../apple-icon";
import manifest from "../manifest";

type Captured = { element: ReactElement; options: { width: number; height: number } };

function svgOf(res: Captured) {
  const { container } = render(res.element);
  const svg = container.querySelector("svg") as SVGSVGElement;
  expect(svg).not.toBeNull();
  return { svg, text: container.textContent ?? "" };
}

function expectArt(svg: SVGSVGElement) {
  const rects = svg.querySelectorAll("rect");
  expect(rects[0].getAttribute("fill")).toBe("#0b1f3a"); // 바탕 남색
  const bars = Array.from(rects).slice(1);
  expect(bars).toHaveLength(3); // 아파트 세 동
  bars.forEach((b) => expect(b.getAttribute("fill")).toBe("#ffffff"));
  const line = svg.querySelector("polyline");
  expect(line?.getAttribute("stroke")).toBe("#ff9a4d"); // 주황 꺾은선
  expect(line?.getAttribute("points")).toBe("5,13 12,9 18,11 27,5");
}

describe("앱 아이콘 — 아파트 세 동 + 주황 꺾은선", () => {
  it("/icon 32px · 둥근 사각 · 「2u」 글자 없음", () => {
    const res = Icon() as unknown as Captured;
    expect(res.options).toMatchObject({ width: 32, height: 32 });
    expect(iconSize).toEqual({ width: 32, height: 32 });
    const { svg, text } = svgOf(res);
    expectArt(svg);
    expect(svg.querySelector("rect")?.getAttribute("rx")).toBe("7");
    expect(text).not.toContain("2u");
  });

  it("/apple-icon 180px · 꽉 찬 남색 바탕(rx 0) · 같은 그림", () => {
    const res = AppleIcon() as unknown as Captured;
    expect(res.options).toMatchObject({ width: 180, height: 180 });
    expect(appleSize).toEqual({ width: 180, height: 180 });
    const { svg, text } = svgOf(res);
    expectArt(svg);
    expect(svg.querySelector("rect")?.getAttribute("rx")).toBe("0");
    expect(text).not.toContain("2u");
  });
});

describe("manifest", () => {
  it("theme_color = #0b1f3a · background_color 는 흰색 그대로", () => {
    const m = manifest();
    expect(m.theme_color).toBe("#0b1f3a");
    expect(m.background_color).toBe("#ffffff");
  });

  it("icons 에 192·512 PNG 가 있고 public/ 에 실제 파일이 있다", () => {
    const icons = manifest().icons ?? [];
    for (const s of [192, 512]) {
      const entry = icons.find((i) => i.sizes === `${s}x${s}`);
      expect(entry).toMatchObject({ src: `/icon-${s}.png`, type: "image/png" });
      expect(existsSync(path.resolve(__dirname, "../../../public", `icon-${s}.png`))).toBe(true);
    }
  });
});
