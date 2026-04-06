"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import MbTradeTable from "@/components/mb/MbTradeTable";
import Pagination from "@/components/Pagination";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import { exportMbTradesToXlsx } from "@/lib/mb-export";
import { PAGE_SIZE } from "@/lib/constants";
import type { MbTrade } from "@/types";

/** 실거래 탭 — 지역별 거래 내역 + 정렬 + ��이지네이션 */
export default function MbTradesTab({
  query,
  page,
  sort,
  onSortChange,
  onPageChange,
}: {
  query: UseQueryResult<{ trades: MbTrade[]; total: number; page: number; page_size: number }>;
  page: number;
  sort: string;
  onSortChange: (s: string) => void;
  onPageChange: (p: number) => void;
}) {
  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          총 {query.data?.total?.toLocaleString() ?? 0}건
        </span>
        <ExportButton
          disabled={!query.data?.trades?.length}
          onClick={() => exportMbTradesToXlsx(query.data?.trades ?? [])}
        />
      </div>
      <MbTradeTable
        trades={query.data?.trades ?? []}
        startIndex={(page - 1) * PAGE_SIZE}
        sort={sort}
        onSortChange={onSortChange}
      />
      {query.data && query.data.total > PAGE_SIZE && (
        <div className="mt-4">
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(query.data.total / PAGE_SIZE)}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </MbTabContent>
  );
}
