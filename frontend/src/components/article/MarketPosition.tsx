"use client";

import { useQuery } from "@tanstack/react-query";
import { getPriceStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatKoreanPrice } from "@/lib/format";
import { InfoCard, InfoRow } from "@/components/article/InfoCards";

interface Props {
  complexNo: string;
  tradeTypeName?: string;
  area2M2?: number;
}

/** 거래유형명 → AreaPriceStat 필드 키 매핑 */
function tradeKey(name?: string): "maemae" | "jeonse" | "wolse" | null {
  if (!name) return null;
  if (name === "매매") return "maemae";
  if (name === "전세") return "jeonse";
  if (name === "월세" || name === "단기임대") return "wolse";
  return null;
}

export default function MarketPosition({ complexNo, tradeTypeName, area2M2 }: Props) {
  const { data } = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    enabled: !!complexNo,
  });

  if (!data || !area2M2) return null;

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
