"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import MbTradeTable from "@/components/mb/MbTradeTable";
import Pagination from "@/components/Pagination";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import MbSortSelect from "@/components/mb/MbSortSelect";
import { exportMbTradesToXlsx } from "@/lib/mb-export";
import { MB_TRADE_SORT_OPTIONS } from "@/lib/mb-sort-options";
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <span className="text-sm text-gray-500">
          총 {query.data?.total?.toLocaleString() ?? 0}건
        </span>
        <div className="flex items-center gap-2">
          <MbSortSelect sort={sort} onSortChange={onSortChange} options={MB_TRADE_SORT_OPTIONS} defaultLabel="기본 (최근 거래월순)" />
          <ExportButton
            disabled={!query.data?.trades?.length}
            onClick={() => exportMbTradesToXlsx(query.data?.trades ?? [])}
          />
        </div>
      </div>
      <MbTradeTable
        trades={query.data?.trades ?? []}
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
