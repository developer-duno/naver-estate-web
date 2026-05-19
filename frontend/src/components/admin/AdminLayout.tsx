"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">관리자</h1>
      <div className="flex gap-6">
        {/* 사이드바 */}
        <nav className="w-40 shrink-0">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block text-sm px-3 py-2 rounded-md ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 pt-4 border-t">
            <Link href="/" className="block text-sm px-3 py-2 text-gray-500 hover:text-blue-600">
              ← 메인으로
            </Link>
          </div>
        </nav>

        {/* 콘텐츠 */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
