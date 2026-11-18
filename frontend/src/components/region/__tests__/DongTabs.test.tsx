/**
 * 허브 「그 동만 보기」(세션 526 B40 PR 2b · 👤 11-18 결정 2 · 설계 §9-1) — 서버 HTML 은 숨김·고른 표시 0(스크립트 끈 사람·봇은 전부) ·
 * 스크립트가 돌면 고른 동 하나만 · 주소 `#동코드` 진입 · 칩 누름 = replaceState(뒤로 가기 안 쌓임) · hashchange 따라감 ·
 * 칩 처음 8개 + 「동 N곳 모두 ▾」(9곳 이상일 때만) · 떠나면 숨김 CSS 를 뗀다 · StrictMode · 묶음 앞 짧은 스크립트 = selectDong 과 같은 결과.
 * 실행: npx vitest run src/components/region/__tests__/DongTabs.test.tsx
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DongTabs, { CHIP_LIMIT, DONG_TABS_SCRIPT, DONG_TABS_STYLE_ID, type DongTab } from "../DongTabs";

const code = (i: number) => String(1114010100 + i * 100);
const makeTabs = (n: number): DongTab[] =>
  Array.from({ length: n }, (_, i) => ({ code: code(i), name: `시험${i + 1}동`, count: 100 - i, href: `#${code(i)}` }));

function Tabs({ n }: { n: number }) {
  const tabs = makeTabs(n);
  return (
    <DongTabs label="중구 동 목록" tabs={tabs}>
      {tabs.map((t) => (
        <section key={t.code} id={t.code} data-dong-group="">
          <h2>{t.name}</h2>
        </section>
      ))}
    </DongTabs>
  );
}

const shown = () => [...document.querySelectorAll<HTMLElement>("section[data-dong-group]")].filter((s) => getComputedStyle(s).display !== "none").map((s) => s.id);
const chipsShown = () =>
  [...document.querySelectorAll<HTMLElement>('nav[aria-label="중구 동 목록"] li')].filter((li) => li.querySelector("a") && getComputedStyle(li).display !== "none").length;

afterEach(() => {
  window.history.replaceState(null, "", "/region/11140");
  vi.restoreAllMocks();
});

describe("서버 HTML(스크립트 끈 사람·봇)", () => {
  it("묶음 전부 · hidden 속성 0 · 고른 표시 0 · 칩은 닻 · 짧은 스크립트가 묶음 앞에", () => {
    const html = renderToString(<Tabs n={12} />);
    expect(html.match(/<section/g)).toHaveLength(12);
    // 짧은 스크립트 글자(숨김 CSS 를 품음) 밖에서 본다
    const outside = html.replace(/<script>[\s\S]*?<\/script>/, "");
    expect(outside).not.toMatch(/\shidden(=|\s|>)/);
    expect(outside).not.toMatch(/aria-current="/);
    expect(outside).not.toContain("data-js-sel");
    expect(outside).not.toContain("display:none");
    expect(html).toContain(`href="#${code(0)}"`);
    expect(html.indexOf("<script>")).toBeGreaterThan(html.indexOf("</nav>"));
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<section"));
    // CSP·React 가 막는 글자 없음(`<` 가 있으면 HTML 파서가 스크립트를 끊는다)
    expect(DONG_TABS_SCRIPT).not.toContain("<");
  });
});

describe("스크립트가 돌 때", () => {
  it("처음 = 첫 동(단지 수 가장 큰 동) 하나만 · 그 칩 표시", () => {
    render(<Tabs n={12} />);
    expect(shown()).toEqual([code(0)]);
    expect(screen.getByRole("link", { name: "시험1동 100" }).getAttribute("aria-current")).toBe("true");
  });

  it("주소 #동코드 로 들어오면 그 동 — 접힌 칩의 동이면 칩 전부 펼침", () => {
    window.history.replaceState(null, "", `/region/11140#${code(10)}`);
    render(<Tabs n={12} />);
    expect(shown()).toEqual([code(10)]);
    expect(chipsShown()).toBe(12);
  });

  it("이 장에 없는 #코드 는 무시하고 첫 동", () => {
    window.history.replaceState(null, "", "/region/11140#9999999999");
    render(<Tabs n={3} />);
    expect(shown()).toEqual([code(0)]);
  });

  it("칩 누름 = 그 동만 · 주소 # 는 replaceState(기록 안 쌓임 — pushState 0)", () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<Tabs n={5} />);
    const before = window.history.length;
    fireEvent.click(screen.getByRole("link", { name: "시험3동 98" }));
    expect(shown()).toEqual([code(2)]);
    expect(window.location.hash).toBe(`#${code(2)}`);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(before);
    expect(screen.getByRole("link", { name: "시험3동 98" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "시험1동 100" }).getAttribute("aria-current")).toBeNull();
  });

  it("Ctrl 누름(새 탭)은 브라우저에 맡긴다", () => {
    render(<Tabs n={5} />);
    fireEvent.click(screen.getByRole("link", { name: "시험3동 98" }), { ctrlKey: true });
    expect(shown()).toEqual([code(0)]);
  });

  it("주소 # 를 바꾸면(hashchange) 따라감", () => {
    render(<Tabs n={5} />);
    window.history.replaceState(null, "", `/region/11140#${code(4)}`);
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(shown()).toEqual([code(4)]);
  });

  it(`칩 처음 ${CHIP_LIMIT}개 + 「동 N곳 모두 ▾」(9곳 이상) — 누르면 전부 · 8곳 이하면 단추 없음`, () => {
    const { unmount } = render(<Tabs n={9} />);
    expect(chipsShown()).toBe(CHIP_LIMIT);
    const more = screen.getByRole("button", { name: "동 9곳 모두 ▾" });
    fireEvent.click(more);
    expect(chipsShown()).toBe(9);
    unmount();
    render(<Tabs n={CHIP_LIMIT} />);
    expect(chipsShown()).toBe(CHIP_LIMIT);
    expect(screen.queryByRole("button", { name: /모두/ })).toBeNull();
  });

  it("떠나면(언마운트) 숨김 CSS·표시를 뗀다 — 다른 장에 숨김이 남지 않게", () => {
    const { unmount } = render(<Tabs n={5} />);
    expect(document.getElementById(DONG_TABS_STYLE_ID)).not.toBeNull();
    unmount();
    expect(document.getElementById(DONG_TABS_STYLE_ID)).toBeNull();
  });

  it("StrictMode(effect 두 번) 에서도 고른 동 하나", () => {
    window.history.replaceState(null, "", `/region/11140#${code(3)}`);
    render(
      <StrictMode>
        <Tabs n={5} />
      </StrictMode>,
    );
    expect(shown()).toEqual([code(3)]);
    expect(document.querySelectorAll(`#${DONG_TABS_STYLE_ID}`)).toHaveLength(1);
  });
});

describe("묶음 앞 짧은 스크립트(바로 들어온 주소 — 그리기 전)", () => {
  /** 서버 HTML 을 그대로 붙이고 그 안의 script 를 currentScript 로 세워 돌린다(jsdom 은 inline script 를 안 돌린다) */
  function runServerScript(hash: string, n: number) {
    window.history.replaceState(null, "", `/region/11140${hash}`);
    const host = document.createElement("div");
    host.innerHTML = renderToString(<Tabs n={n} />);
    document.body.appendChild(host);
    const s = host.querySelector("script")!;
    vi.spyOn(document, "currentScript", "get").mockReturnValue(s);
    new Function(s.textContent!)();
    return host;
  }

  it("#동코드 의 동 하나만 · 그 칩 표시 · 접힌 칩이면 펼침", () => {
    const host = runServerScript(`#${code(9)}`, 12);
    expect(shown()).toEqual([code(9)]);
    expect(host.querySelector(`[data-dong-chip="${code(9)}"]`)!.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector("[data-dong-tabs]")!.hasAttribute("data-all")).toBe(true);
    host.remove();
    document.getElementById(DONG_TABS_STYLE_ID)?.remove();
  });

  it("# 없으면 첫 동 · 칩 8개", () => {
    const host = runServerScript("", 12);
    expect(shown()).toEqual([code(0)]);
    expect(chipsShown()).toBe(CHIP_LIMIT);
    host.remove();
    document.getElementById(DONG_TABS_STYLE_ID)?.remove();
  });
});
