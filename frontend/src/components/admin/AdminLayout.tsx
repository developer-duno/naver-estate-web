"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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

  // 모바일 가로 스크롤 시 현재 페이지 탭이 화면 밖이면 안 보이므로 자동으로 보이게 스크롤.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">관리자</h1>

      {/* 상단 가로탭 — 모바일은 가로 스크롤 (overflow-x-auto). non-sticky (Header·패널 top 충돌 회피) */}
      <nav className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
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

      {/* 콘텐츠 — min-w-0 보존 (page.tsx 3열 grid overflow 방어) */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
