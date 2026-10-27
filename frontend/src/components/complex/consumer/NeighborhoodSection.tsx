"use client";

import Link from "next/link";
import type { NeighborhoodInfo, SubwayStationNear } from "@/types";
import type { PublicSummaryBreadcrumb } from "@/types/public-summary";
import { REGION_PAGES_ENABLED, dongPagePath, regionHubPath } from "@/lib/seo/complex-page";
import { Card } from "@/components/ui/card";
import { formatDistance, formatStationName, normalizeLineName } from "@/lib/subway-format";
import LoadRetry from "./LoadRetry";
import { peopleText } from "./consumer-format";

interface Props {
  stations: SubwayStationNear[];
  neighborhood: NeighborhoodInfo | null | undefined;
  /** 이 카드 자료 중 불러오지 못한 것이 있으면 다시 시도 — 자료가 없어도 카드를 숨기지 않는다(보완 A-4) */
  onRetry?: () => void;
  /** 서버 공개 요약 빵부스러기 — 동 페이지·허브 링크 재료(없으면 링크 없음) */
  breadcrumb?: PublicSummaryBreadcrumb | null;
}

/** 지하철 막대 척도 — BE 반경과 같은 3km */
const SUBWAY_SCALE_M = 3000;

/** 동네 한 줄 — 사는 사람·1인 가구·아파트 비율 중 있는 것만 */
export function neighborhoodLine(n: NeighborhoodInfo): string {
  const parts: string[] = [];
  if (n.population != null) parts.push(`사는 사람 ${peopleText(n.population)}`);
  if (n.one_person_pct != null) parts.push(`1인 가구 ${n.one_person_pct}%`);
  if (n.house_mix?.apt_pct != null) parts.push(`아파트 ${n.house_mix.apt_pct}%`);
  return parts.join(" · ");
}

/**
 * S3 · 주변은 어떤가 — 지하철·동네 둘 다 없으면 카드 숨김.
 * 동네 통계(칸·집 종류 띠·위험지도)는 같은 동 단지마다 똑같이 반복되므로 한 줄 + 동 페이지(없으면 시군구 허브) 링크로
 * 줄였다(세션 483 PR 3b · 결정 24). 링크는 지역 페이지가 열린 뒤(REGION_PAGES_ENABLED)에만. 지하철 거리는 그대로.
 */
export default function NeighborhoodSection({ stations, neighborhood: n, onRetry, breadcrumb = null }: Props) {
  if (stations.length === 0 && !n && !onRetry) return null;
  const lines = [...new Set(stations.flatMap((s) => s.lines.map(normalizeLineName)))];
  const line = n ? neighborhoodLine(n) : "";
  const dongHref =
    REGION_PAGES_ENABLED && breadcrumb
      ? breadcrumb.dong_has_page
        ? dongPagePath(breadcrumb.sigungu_code, breadcrumb.dong_code)
        : regionHubPath(breadcrumb.sigungu_code)
      : null;

  return (
    <Card className="p-4 space-y-3" aria-labelledby="consumer-q3">
      <h2 id="consumer-q3" className="text-sm font-bold text-blue-700 tracking-wide">3 · 주변은 어떤가</h2>
      {stations.length > 0 && (
        <div className="space-y-1.5" data-testid="consumer-subway">
          {stations.map((s) => (
            <div key={s.station_name} className="flex items-center gap-2 text-xs">
              <span className="w-20 truncate">{formatStationName(s.station_name)}</span>
              <div className="relative flex-1 h-2.5 rounded-full bg-slate-200" aria-hidden="true">
                <i className="absolute inset-y-0 left-0 rounded-full bg-blue-700" style={{ width: `${Math.min(100, (s.distance_m / SUBWAY_SCALE_M) * 100)}%` }} />
              </div>
              <span className="w-14 text-right">{formatDistance(s.distance_m)}</span>
            </div>
          ))}
          <p className="text-xs text-gray-500">{[...lines, "직선거리"].join(" · ")}</p>
        </div>
      )}
      {n && (line || dongHref) && (
        <p className="text-sm" data-testid="consumer-neighborhood">
          {n.emd_nm ? `${n.emd_nm} ` : ""}{line}
          {n.source && <span className="text-xs text-gray-400"> · {n.source}</span>}
          {dongHref && (
            <>
              {" "}
              <Link href={dongHref} className="text-xs text-blue-700 underline">동네 정보 더 보기</Link>
            </>
          )}
        </p>
      )}
      {onRetry && <LoadRetry onRetry={onRetry} />}
    </Card>
  );
}
