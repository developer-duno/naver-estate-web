"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import { getDataFreshness } from "@/lib/api";
import { worstStatus, deriveHealthStatus } from "@/lib/admin/status-derivation";

type Colorize = false | "freshness" | "health";

interface NavItem {
  id: string;
  label: string;
  colorize: Colorize;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: "health", label: "건강도", colorize: "health" },
  { id: "weekly-issues", label: "이번 주 이슈", colorize: false },
  { id: "stats", label: "통계", colorize: false },
  { id: "scheduler", label: "스케줄러", colorize: false },
  { id: "freshness", label: "데이터 신선도", colorize: "freshness" },
  { id: "naver-calls", label: "네이버 호출", colorize: false },
  { id: "quota", label: "쿼터", colorize: false },
  { id: "failure", label: "실패 분류", colorize: false },
];

const DOT_CLASS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  unknown: "bg-gray-300",
};

export default function AdminLeftNav() {
  const { token } = useTokenReady();

  const freshnessQuery = useQuery({
    queryKey: queryKeys.admin.dataFreshness(),
    queryFn: () => getDataFreshness(token),
    enabled: !!token,
    staleTime: 30_000,
  });

  const freshnessStatus = worstStatus(freshnessQuery.data?.items);
  const healthStatus = deriveHealthStatus(freshnessQuery.data?.items);

  const statusFor = (colorize: Colorize): string => {
    if (colorize === "freshness") return freshnessStatus;
    if (colorize === "health") return healthStatus;
    return "unknown";
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="space-y-1 sticky top-20" aria-label="대시보드 카드 목차">
      <h3 className="text-xs font-semibold text-gray-500 mb-2 px-3 uppercase tracking-wide">
        카드 점프
      </h3>
      <ul className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const dotKey = statusFor(item.colorize);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => scrollTo(item.id)}
                className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 text-left"
              >
                <span
                  className={`w-2 h-2 rounded-full ${DOT_CLASS[dotKey] ?? DOT_CLASS.unknown}`}
                  aria-hidden
                />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
