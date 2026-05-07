"use client";

/** /admin "이번 주 챙길 일" 카드 — 검증 대기 + 최근 7일 실패 크롤 + 헛바퀴 종목 합산 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getAdminVerifications,
  getAdminCrawlFailures,
  getDataFreshness,
} from "@/lib/api";
import AdminCard from "./AdminCard";

interface Props {
  token: string;
}

export default function WeeklyIssuesCard({ token }: Props) {
  const verificationsQuery = useQuery({
    queryKey: queryKeys.admin.verifications({ status: "pending" }),
    queryFn: () => getAdminVerifications(token, { status: "pending" }),
    enabled: !!token,
    staleTime: 30_000,
  });
  const failuresQuery = useQuery({
    queryKey: queryKeys.admin.crawlFailures(168),
    queryFn: () => getAdminCrawlFailures(token, 168),
    enabled: !!token,
    staleTime: 30_000,
  });
  const freshnessQuery = useQuery({
    queryKey: queryKeys.admin.dataFreshness(),
    queryFn: () => getDataFreshness(token),
    enabled: !!token,
    staleTime: 30_000,
  });

  const pendingCount = verificationsQuery.data?.total ?? 0;
  const failuresCount = failuresQuery.data?.total ?? 0;
  const spinningCount =
    freshnessQuery.data?.items.filter((i) => i.spinning).length ?? 0;
  const totalIssues = pendingCount + failuresCount + spinningCount;

  const isLoading =
    verificationsQuery.isLoading ||
    failuresQuery.isLoading ||
    freshnessQuery.isLoading;

  const scrollToFreshness = () => {
    document
      .getElementById("freshness")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const linkClass = (n: number) =>
    n > 0 ? "text-red-700 font-medium hover:underline" : "text-gray-400";

  return (
    <AdminCard
      title={`이번 주 챙길 일 ${isLoading ? "" : `${totalIssues}건`}`}
      help="공인중개사 검증 대기, 최근 7일 실패한 크롤 작업, 데이터가 안 들어오는 헛바퀴 종목 — 관리자가 직접 손봐야 하는 일들을 모아 보여줘요. 0건이면 이번 주는 한가해요"
    >
      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-gray-700">검증 대기 공인중개사</span>
          <a
            href="/admin/users#verification-review"
            aria-label={`검증 대기 공인중개사 ${pendingCount}건 — 클릭 시 사용자 관리 페이지로 이동`}
            className={linkClass(pendingCount)}
          >
            {pendingCount}건 →
          </a>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-gray-700">최근 7일 실패한 크롤</span>
          <button
            type="button"
            onClick={scrollToFreshness}
            aria-label={`최근 7일 실패한 크롤 ${failuresCount}건 — 클릭 시 신선도 카드로 이동`}
            className={linkClass(failuresCount)}
          >
            {failuresCount}건 →
          </button>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-gray-700">데이터 헛바퀴 종목</span>
          <button
            type="button"
            onClick={scrollToFreshness}
            aria-label={`데이터 헛바퀴 종목 ${spinningCount}건 — 클릭 시 신선도 카드로 이동`}
            className={linkClass(spinningCount)}
          >
            {spinningCount}건 →
          </button>
        </li>
      </ul>
    </AdminCard>
  );
}
