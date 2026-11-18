"use client";

import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";

export interface DongTab {
  code: string;
  name: string;
  /** 동 단지 수 — 칩에 이름과 같이(T8) */
  count: number;
  /** 같은 장 안 닻(`#동코드`) — 스크립트가 꺼져 있으면 이 닻으로 뛴다 */
  href: string;
}

/** 처음 보이는 칩 수 — 넘으면 「동 N곳 모두 ▾」(9곳 이상일 때만) */
export const CHIP_LIMIT = 8;
export const DONG_TABS_STYLE_ID = "dong-tabs-css";

/** 고른 동 말고 숨기는 CSS(「@」 자리 = 동 코드) — 스크립트가 돌 때만 head 에 붙는다(서버 HTML 엔 숨김 0, 설계 §9-1) */
export const DONG_TABS_CSS =
  '[data-dong-tabs][data-js-sel] [data-dong-group]:not([id="@"]){display:none}' +
  "[data-dong-tabs][data-js-sel]:not([data-all]) [data-chip-extra]{display:none}" +
  "[data-dong-tabs][data-js-sel]:not([data-all]) [data-chip-more]{display:inline-flex}";

const CODE_RE = /^\d{10}$/;

/**
 * 묶음 앞 짧은 스크립트 — 첫 HTML 안에서 칩 목록 바로 뒤·동 묶음 앞에 놓여 그리기 전에 돈다.
 * 주소 `#동코드` 가 칩에 있으면 그 동, 없으면 첫 칩(단지 수 가장 큰 동)을 골라 표시(data-js-sel·aria-current)를 붙이고 숨김 CSS 를 단다.
 * 아래 selectDong 과 같은 일을 한다(시험이 둘을 대조). CSP 는 script-src 'unsafe-inline'(next.config.ts) — 글자에 `<` 를 쓰지 않는다.
 */
export const DONG_TABS_SCRIPT =
  `(function(){var s=document.currentScript,r=s&&s.parentNode;if(!r)return;` +
  `var h=location.hash.slice(1),a=/^\\d{10}$/.test(h)?r.querySelector('[data-dong-chip="'+h+'"]'):null;` +
  `a=a||r.querySelector("[data-dong-chip]");if(!a)return;var c=a.getAttribute("data-dong-chip");` +
  `r.setAttribute("data-js-sel",c);a.setAttribute("aria-current","true");if(a.closest("[data-chip-extra]"))r.setAttribute("data-all","");` +
  `var e=document.getElementById("${DONG_TABS_STYLE_ID}")||document.head.appendChild(document.createElement("style"));` +
  `e.id="${DONG_TABS_STYLE_ID}";e.textContent=${JSON.stringify(DONG_TABS_CSS)}.split("@").join(c)})();`;

/** 그 동을 고른다 — 표시·고른 칩·숨김 CSS(고른 칩이 접힌 칩이면 칩 전부 펼침) */
export function selectDong(root: HTMLElement, code: string): void {
  root.setAttribute("data-js-sel", code);
  let chosen: Element | null = null;
  root.querySelectorAll("[data-dong-chip]").forEach((a) => {
    if (a.getAttribute("data-dong-chip") === code) {
      a.setAttribute("aria-current", "true");
      chosen = a;
    } else {
      a.removeAttribute("aria-current");
    }
  });
  if ((chosen as Element | null)?.closest("[data-chip-extra]")) root.setAttribute("data-all", "");
  const style = document.getElementById(DONG_TABS_STYLE_ID) ?? document.head.appendChild(document.createElement("style"));
  style.id = DONG_TABS_STYLE_ID;
  style.textContent = DONG_TABS_CSS.split("@").join(code);
}

/** 떠날 때 원래대로 — 표시·고른 칩·숨김 CSS 를 모두 뗀다(다른 장에 숨김이 남지 않게) */
function clearDong(root: HTMLElement): void {
  root.removeAttribute("data-js-sel");
  root.removeAttribute("data-all");
  root.querySelectorAll("[data-dong-chip]").forEach((a) => a.removeAttribute("aria-current"));
  document.getElementById(DONG_TABS_STYLE_ID)?.remove();
}

/** 주소 `#동코드` 가 이 장의 칩이면 그 코드 */
function codeFromHash(root: HTMLElement): string | null {
  const h = window.location.hash.slice(1);
  return CODE_RE.test(h) && root.querySelector(`[data-dong-chip="${h}"]`) ? h : null;
}

/** 칩 모양은 목록 한 곳의 클래스로(칩마다 붙이면 동 46곳 허브 HTML 이 그만큼 커진다) */
const CHIPS_CLASS =
  "flex flex-wrap gap-1.5 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-1 [&_a]:rounded-full [&_a]:border [&_a]:border-brand-line " +
  "[&_a]:bg-white [&_a]:px-3.5 [&_a]:text-sm [&_a]:text-brand-navy [&_a:hover]:bg-brand-bg [&_a[aria-current=true]]:border-brand-navy " +
  "[&_a[aria-current=true]]:bg-brand-navy [&_a[aria-current=true]]:font-bold [&_a[aria-current=true]]:text-white";

/**
 * 시군구 허브의 「그 동만 보기」(세션 526 B40 PR 2b · 👤 11-18 결정 2 — 10-28 결정 32·35 를 바꿈).
 * 서버가 동 묶음을 전부 그려 children 으로 넘긴다(첫 HTML 에 전부 · 숨김 0 · 스크립트 끈 사람·봇은 전부 보고 칩은 닻으로 뛴다).
 * 스크립트가 돌면 고른 동 하나만 보인다: 바로 들어온 주소는 위 짧은 스크립트가 그리기 전에, 클라이언트 이동(Next Link — 그때는
 * React 가 만든 script 가 안 돈다)은 layout effect 가 그리기 전에 고른다. 칩을 누르면 그 동으로 바꾸고 주소 `#` 는 replaceState
 * (뒤로 가기가 안 쌓임) · 주소를 손으로 바꾸면 hashchange 를 따라간다. 표시는 React 가 그리지 않는 속성이라 suppressHydrationWarning.
 */
export default function DongTabs({ label, tabs, children }: { label: string; tabs: DongTab[]; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const first = tabs[0]?.code ?? null;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !first) return;
    selectDong(root, codeFromHash(root) ?? root.getAttribute("data-js-sel") ?? first);
    const onHash = () => {
      const c = codeFromHash(root);
      if (c) selectDong(root, c);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearDong(root);
    };
  }, [first]);

  const onChip = (e: MouseEvent<HTMLAnchorElement>, code: string) => {
    // 새 탭·새 창으로 여는 누름은 브라우저에 맡긴다
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !rootRef.current) return;
    e.preventDefault();
    selectDong(rootRef.current, code);
    window.history.replaceState(window.history.state, "", `#${code}`);
  };

  return (
    <div ref={rootRef} data-dong-tabs="" suppressHydrationWarning className="space-y-4">
      <nav aria-label={label}>
        <ul className={CHIPS_CLASS}>
          {tabs.map((t, i) => (
            <li key={t.code} data-chip-extra={i >= CHIP_LIMIT ? "" : undefined}>
              <a href={t.href} data-dong-chip={t.code} suppressHydrationWarning onClick={(e) => onChip(e, t.code)}>
                {t.name} <span className="text-xs tabular-nums opacity-75">{t.count.toLocaleString()}</span>
              </a>
            </li>
          ))}
          {tabs.length > CHIP_LIMIT && (
            <li>
              <button
                type="button"
                data-chip-more=""
                onClick={() => rootRef.current?.setAttribute("data-all", "")}
                className="hidden min-h-11 items-center rounded-full border border-brand-line bg-brand-bg px-3.5 text-sm font-bold text-brand-navy hover:bg-white"
              >
                동 {tabs.length.toLocaleString()}곳 모두 ▾
              </button>
            </li>
          )}
        </ul>
      </nav>
      <script>{DONG_TABS_SCRIPT}</script>
      {children}
    </div>
  );
}
