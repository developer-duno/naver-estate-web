"use client";

import { useQuery } from "@tanstack/react-query";
import { getPyeongDetails } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { InfoCard, InfoRow } from "@/components/article/InfoCards";

interface Props {
  complexNo: string;
  area2M2?: number;
  /** B2 게이트 토큰 — 부모(ArticleDetail)와 같은 queryKey 라 토큰도 같이 받아야 한다 (세션 395) */
  accessToken?: string;
  /** 세션 해석 완료 여부. 부모가 안 넘기면(단독 사용) 기존 동작 유지 */
  tokenReady?: boolean;
}

/** 관리비를 "N만원" 형식으로 포맷 */
function fmtCost(v?: number | null): string | null {
  if (v == null || v === 0) return null;
  return `${v.toLocaleString()}만원`;
}

export default function MaintenanceCost({ complexNo, area2M2, accessToken, tokenReady = true }: Props) {
  const { data, isError } = useQuery({
    queryKey: queryKeys.pyeongDetails(complexNo),
    queryFn: () => getPyeongDetails(complexNo, accessToken),
    enabled: !!complexNo && tokenReady,
  });

  if (isError || !data?.pyeong_details?.length || !area2M2 || area2M2 <= 0) return null;

  // exclusive_area(문자열)를 숫자로 변환 후 area2M2와 가장 가까운 면적 매칭
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < data.pyeong_details.length; i++) {
    const ea = parseFloat(data.pyeong_details[i].exclusive_area ?? "");
    if (isNaN(ea)) continue;
    const diff = Math.abs(ea - area2M2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  const p = data.pyeong_details[bestIdx];
  const avg = fmtCost(p.avg_maintenance_cost);
  const summer = fmtCost(p.summer_maintenance_cost);
  const winter = fmtCost(p.winter_maintenance_cost);
  const latest = fmtCost(p.latest_maintenance_cost);

  if (!avg && !summer && !winter && !latest) return null;

  const areaLabel = p.exclusive_area ? `${p.exclusive_area}㎡` : "";

  return (
    <InfoCard title={`관리비 상세${areaLabel ? ` (${areaLabel})` : ""}`}>
      <InfoRow label="평균 관리비" value={avg} />
      <InfoRow label="여름 관리비" value={summer} />
      <InfoRow label="겨울 관리비" value={winter} />
      <InfoRow label="최근 관리비" value={latest} />
    </InfoCard>
  );
}
