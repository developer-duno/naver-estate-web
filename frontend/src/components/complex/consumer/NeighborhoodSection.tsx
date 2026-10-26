"use client";

import type { NeighborhoodInfo, SubwayStationNear } from "@/types";
import { Card } from "@/components/ui/card";
import { formatDistance, formatStationName, normalizeLineName } from "@/lib/subway-format";
import { peopleText } from "./consumer-format";

interface Props {
  stations: SubwayStationNear[];
  neighborhood: NeighborhoodInfo | null | undefined;
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

/** S3 · 주변은 어떤가 — 지하철·동네 둘 다 없으면 카드 숨김 */
export default function NeighborhoodSection({ stations, neighborhood: n }: Props) {
  if (stations.length === 0 && !n) return null;
  const lines = [...new Set(stations.flatMap((s) => s.lines.map(normalizeLineName)))];

  const stats: { label: string; value: string; note?: string }[] = [];
  if (n) {
    if (n.population != null) {
      stats.push({ label: "사는 사람", value: peopleText(n.population), note: n.avg_age != null ? `평균 ${Math.round(n.avg_age)}세` : undefined });
    }
    if (n.one_person_pct != null) stats.push({ label: "1인 가구", value: `${n.one_person_pct}%` });
    if (n.corp_cnt != null) stats.push({ label: "일터", value: `사업체 ${n.corp_cnt.toLocaleString()}곳` });
    if (n.old_house_pct != null) stats.push({ label: `${n.old_house_cutoff} 집`, value: `${n.old_house_pct}%` });
  }
  const mix = n?.house_mix;
  const mixParts = mix
    ? [
        { label: "아파트", pct: mix.apt_pct, color: "bg-blue-700" },
        { label: "오피스텔", pct: mix.officetel_pct, color: "bg-blue-400" },
        { label: "다세대", pct: mix.row_pct, color: "bg-indigo-300" },
        { label: "단독", pct: mix.detached_pct, color: "bg-slate-300" },
      ]
    : [];
  const hazards = [
    n?.flood?.affected ? "홍수 위험지도 영향 동" : null,
    n?.landslide?.affected ? "산사태 위험지도 영향 동" : null,
  ].filter((v): v is string => v != null);

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
      {n && (
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
      )}
    </Card>
  );
}
