"use client";

import { useQuery } from "@tanstack/react-query";
import { getPriceStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatKoreanPrice } from "@/lib/format";
import { tradeKey } from "@/lib/trade-types";
import { InfoCard, InfoRow } from "@/components/article/InfoCards";

interface Props {
  complexNo: string;
  tradeTypeName?: string;
  area2M2?: number;
}

export default function MarketPosition({ complexNo, tradeTypeName, area2M2 }: Props) {
  const { data, isError } = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    enabled: !!complexNo,
  });

  if (isError || !data || !area2M2 || area2M2 <= 0) return null;

  // label 형식: "{int}m²" (5m² 버킷) — area2M2가 속하는 버킷 찾기
  const bucket = Math.floor(area2M2 / 5) * 5;
  const matched = data.by_area.find((row) => {
    const num = parseInt(row.label, 10);
    return !isNaN(num) && num === bucket;
  });

  if (!matched) return null;

  const key = tradeKey(tradeTypeName);
  if (!key) return null;

  const avgPrice = matched[key];
  const countKey = `${key}_count` as const;
  const count = matched[countKey];

  if (avgPrice == null) return null;

  return (
    <InfoCard title={`시세 정보 (${matched.label} 기준)`}>
      <InfoRow label={`${tradeTypeName} 평균가`} value={formatKoreanPrice(avgPrice)} />
      {count != null && <InfoRow label={`${tradeTypeName} 매물 수`} value={`${count}건`} />}
    </InfoCard>
  );
}
