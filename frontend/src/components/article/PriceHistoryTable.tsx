"use client";

import { useQuery } from "@tanstack/react-query";
import { getArticlePriceHistory } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatKoreanPrice } from "@/lib/format";
import { SkeletonRows } from "@/components/Skeleton";

interface Props {
  articleNo: string;
}

export default function PriceHistoryTable({ articleNo }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.articlePriceHistory(articleNo),
    queryFn: () => getArticlePriceHistory(articleNo),
  });

  if (isLoading) return <SkeletonRows rows={3} rowHeight="h-8" />;

  const history = data?.history;
  if (!history || history.length === 0) return null;

  return (
    <div className="rounded-lg border bg-gray-50/50 p-4">
      <h4 className="text-sm font-semibold mb-2">가격 변동 이력</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b text-xs">
            <th className="text-left py-1 font-medium">날짜</th>
            <th className="text-right py-1 font-medium">가격</th>
            <th className="text-right py-1 font-medium">월세</th>
            <th className="text-right py-1 font-medium">변동</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h, i) => {
            const prev = i < history.length - 1 ? history[i + 1] : null;
            const diff =
              h.price != null && prev?.price != null ? h.price - prev.price : null;
            return (
              <tr key={h.recorded_at ?? i} className="border-b last:border-0">
                <td className="py-1 text-gray-600">
                  {h.recorded_at ? h.recorded_at.slice(0, 10) : "-"}
                </td>
                <td className="py-1 text-right">
                  {h.price != null ? formatKoreanPrice(h.price) : "-"}
                </td>
                <td className="py-1 text-right">
                  {h.rent_price != null ? formatKoreanPrice(h.rent_price) : "-"}
                </td>
                <td className="py-1 text-right">
                  {diff != null && diff !== 0 ? (
                    <span className={diff > 0 ? "text-red-500" : "text-green-600"}>
                      {diff > 0 ? "▲" : "▼"} {formatKoreanPrice(Math.abs(diff))}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
