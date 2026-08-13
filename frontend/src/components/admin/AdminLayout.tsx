"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/crawl", label: "크롤링" },
  { href: "/admin/scheduler-calendar", label: "캘린더" },
  { href: "/admin/data", label: "데이터" },
  { href: "/admin/logs", label: "감사 로그" },
  { href: "/admin/settings", label: "설정" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const navRef = useRef<HTMLElement | null>(null);
  // 오른쪽에 더 볼 탭이 남았는지 — 남았을 때만 페이드 힌트를 띄운다.
  const [atEnd, setAtEnd] = useState(true);

  const updateHint = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    // 스크롤 여지 자체가 없거나(데스크톱) 끝까지 밀었으면 힌트 불필요. ±1px 은 소수점 반올림 오차 여유.
    const noScroll = el.scrollWidth <= el.clientWidth + 1;
    const reachedEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setAtEnd(noScroll || reachedEnd);
  }, []);

  // 콜백 ref 로 첫 측정 — DOM 이 붙는 커밋 시점(페인트 전)이라 힌트가 깜빡이지 않는다.
  // useLayoutEffect 대신 쓰는 이유: 이펙트 본문 setState 경고(react-hooks/set-state-in-effect) 회피.
  const attachNav = useCallback(
    (el: HTMLElement | null) => {
      navRef.current = el;
      updateHint();
    },
    [updateHint],
  );

  // 모바일 가로 스크롤 시 현재 페이지 탭이 화면 밖이면 안 보이므로 자동으로 보이게 스크롤.
  // 이때 스크롤이 실제로 움직이면 onScroll 이 발화해 힌트가 알아서 갱신되므로 여기서 따로 계산하지 않는다.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">관리자</h1>

      {/* 상단 가로탭 — 모바일은 가로 스크롤 (overflow-x-auto). non-sticky (Header·패널 top 충돌 회피) */}
      {/* relative 래퍼: 페이드 힌트를 nav 높이에 정확히 맞추려고 nav 의 mb-6 를 여기로 올림 */}
      <div className="relative mb-6">
        <nav
          ref={attachNav}
          onScroll={updateHint}
          className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/admin"
              ? pathname === "/admin"
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={isActive ? activeRef : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap min-h-[44px] flex items-center text-sm px-3 border-b-2 -mb-px ${
                  isActive
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap min-h-[44px] flex items-center text-sm px-3 ml-auto text-gray-500 hover:text-blue-600"
          >
            ← 메인으로
          </Link>
        </nav>
        {/* 페이드 힌트 — "옆에 탭이 더 있다"는 시각 신호. body 가 bg-gray-50 이라 from-gray-50.
            pointer-events-none 이라 아래 링크 클릭을 막지 않는다. */}
        {!atEnd && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-l from-gray-50 to-transparent"
          />
        )}
      </div>

      {/* 콘텐츠 — min-w-0 보존 (page.tsx 3열 grid overflow 방어) */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
