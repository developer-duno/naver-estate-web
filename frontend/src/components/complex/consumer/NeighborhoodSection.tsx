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
  /** 동네 통계를 한 줄 + 링크로 줄일까 — 기본 = 지역 페이지 열림 여부(결정 28). 시험은 직접 넣는다 */
  compact?: boolean;
}

/** 지하철 막대 척도 — BE 반경과 같은 3km */
const SUBWAY_SCALE_M = 3000;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <span className="block text-xs text-gray-500">{label}</span>
      <b className="text-sm">{value}</b>
      {note && <span className="text-xs text-gray-500"> · {note}</span>}
    </div>
  );
}

/** 동네 한 줄 — 사는 사람·1인 가구·아파트 비율 중 있는 것만 */
export function neighborhoodLine(n: NeighborhoodInfo): string {
  const parts: string[] = [];
  if (n.population != null) parts.push(`사는 사람 ${peopleText(n.population)}`);
  if (n.one_person_pct != null) parts.push(`1인 가구 ${n.one_person_pct}%`);
  if (n.house_mix?.apt_pct != null) parts.push(`아파트 ${n.house_mix.apt_pct}%`);
  return parts.join(" · ");
}

/** 지금(#773)의 동네 통계 — 칸·집 종류 띠·위험지도 칩. 지역 페이지가 열리기 전엔 이것을 그대로 보인다(결정 28) */
function NeighborhoodFull({ n }: { n: NeighborhoodInfo }) {
  const stats: { label: string; value: string; note?: string }[] = [];
  if (n.population != null) {
    stats.push({ label: "사는 사람", value: peopleText(n.population), note: n.avg_age != null ? `평균 ${Math.round(n.avg_age)}세` : undefined });
  }
  if (n.one_person_pct != null) stats.push({ label: "1인 가구", value: `${n.one_person_pct}%` });
  if (n.corp_cnt != null) stats.push({ label: "일터", value: `사업체 ${n.corp_cnt.toLocaleString()}곳` });
  if (n.old_house_pct != null) stats.push({ label: `${n.old_house_cutoff} 집`, value: `${n.old_house_pct}%` });
  const mix = n.house_mix;
  const mixParts = mix
    ? [
        { label: "아파트", pct: mix.apt_pct, color: "bg-blue-700" },
        { label: "오피스텔", pct: mix.officetel_pct, color: "bg-blue-400" },
        { label: "다세대", pct: mix.row_pct, color: "bg-indigo-300" },
        { label: "단독", pct: mix.detached_pct, color: "bg-slate-300" },
      ]
    : [];
  const hazards = [
    n.flood?.affected ? "홍수 위험지도 영향 동" : null,
    n.landslide?.affected ? "산사태 위험지도 영향 동" : null,
  ].filter((v): v is string => v != null);

  return (
    <div className="space-y-2" data-testid="consumer-neighborhood">
      {n.emd_nm && <h3 className="text-sm font-bold">{n.emd_nm}</h3>}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => <Stat key={s.label} {...s} />)}
        </div>
      )}
      {mix && (
        <div>
          <span className="block text-xs text-gray-500 mb-1">집 종류</span>
          <div className="flex h-3.5 rounded-full overflow-hidden bg-slate-100" aria-hidden="true">
            {mixParts.map((p) => <i key={p.label} className={p.color} style={{ width: `${p.pct}%` }} />)}
          </div>
          <p className="mt-1 text-xs text-gray-500">{mixParts.map((p) => `${p.label} ${p.pct}%`).join(" · ")}</p>
        </div>
      )}
      {hazards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hazards.map((h) => (
            <span key={h} className="text-xs rounded-full border border-amber-500 text-amber-800 px-2.5 py-0.5">{h}</span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">{n.source}</p>
    </div>
  );
}

/**
 * S3 · 주변은 어떤가 — 지하철·동네 둘 다 없으면 카드 숨김. 지하철 거리는 늘 그대로.
 * 동네 통계: 지역 페이지가 열리기 전(compact=false, 기본 = REGION_PAGES_ENABLED)엔 지금(#773)처럼 칸·띠·위험지도 전부,
 * 열린 뒤(compact=true)엔 한 줄 + 동 페이지(없으면 시군구 허브) 링크(결정 24 의 '반복 줄이기'를 3c 와 같이 — 결정 28).
 */
export default function NeighborhoodSection({ stations, neighborhood: n, onRetry, breadcrumb = null, compact = REGION_PAGES_ENABLED }: Props) {
  if (stations.length === 0 && !n && !onRetry) return null;
  const lines = [...new Set(stations.flatMap((s) => s.lines.map(normalizeLineName)))];
  const line = n ? neighborhoodLine(n) : "";
  const dongHref =
    compact && breadcrumb
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
      {n && !compact && <NeighborhoodFull n={n} />}
      {n && compact && (line || dongHref) && (
        <p className="text-sm" data-testid="consumer-neighborhood">
          {n.emd_nm ? `${n.emd_nm} ` : ""}{line}
          {n.source && <span className="text-xs text-gray-400"> · {n.source}</span>}
          {dongHref && (
            <>
              {" "}
              <Link href={dongHref} prefetch={false} className="text-xs text-blue-700 underline">동네 정보 더 보기</Link>
            </>
          )}
        </p>
      )}
      {onRetry && <LoadRetry onRetry={onRetry} />}
    </Card>
  );
}
