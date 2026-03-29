"use client";

import type { MbTrade } from "@/types";
import { formatKoreanPrice } from "@/lib/format";

interface Props {
  trades: MbTrade[];
  startIndex?: number;
}

export default function MbTradeTable({ trades, startIndex = 0 }: Props) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        실거래 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100 border-b-2 border-gray-300">
          <tr>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">#</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">단지명</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">동</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">거래월</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">면적(㎡)</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">가격</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">층</th>
            <th className="px-3 py-2.5 text-right text-gray-700 font-semibold">건축년도</th>
            <th className="px-3 py-2.5 text-left text-gray-700 font-semibold">거래유형</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
              <td className="px-3 py-2 text-gray-500">{startIndex + i + 1}</td>
              <td className="px-3 py-2 font-medium text-gray-800">{t.apt_name ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{t.dong ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">{t.deal_month ?? "-"}</td>
              <td className="px-3 py-2 text-right">{t.area != null ? t.area.toFixed(1) : "-"}</td>
              <td className="px-3 py-2 text-right font-medium">
                {t.price != null ? formatKoreanPrice(t.price) : "-"}
              </td>
              <td className="px-3 py-2 text-right">{t.floor ?? "-"}</td>
              <td className="px-3 py-2 text-right">{t.build_year ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600">
                {t.trade_type ?? "-"}
                {t.cancel_date && (
                  <span className="ml-1 text-xs text-red-500">(취소)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
