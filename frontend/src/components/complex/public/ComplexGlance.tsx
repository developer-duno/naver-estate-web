import { formatKoreanPrice } from "@/lib/format";
import { formatDistance, formatStationName } from "@/lib/subway-format";
import { repAreaRange, repOfficial } from "@/lib/seo/complex-page";
import BrandCard from "@/components/brand/BrandCard";
import {
  isOfficetel,
  kaptCostText,
  priceRangeText,
  wonToManwon,
  ymDot,
} from "@/components/complex/consumer/consumer-format";
import type { PublicSummary } from "@/types/public-summary";

/** 남색 띠 사실 줄 「1998년 사용승인 · 4,168세대 · 16개동」 — 있는 값만, 셋 다 없으면 null(세션 524 B40 PR 1) */
export function bandFactLine(s: Pick<PublicSummary, "use_approve_year" | "household_count" | "building_count">): string | null {
  const parts = [
    s.use_approve_year != null ? `${s.use_approve_year}년 사용승인` : null,
    s.household_count != null ? `${s.household_count.toLocaleString()}세대` : null,
    s.building_count != null ? `${s.building_count}개동` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * '한눈에 보기'(서버가 그림, 세션 483 PR 3b · 결정 23 A안 · 세션 524 B40 PR 1 새 틀) — 남색 띠에 걸치는 첫 흰 카드.
 * 큰 줄 = 대표 면적 최근 6개월 범위(없으면 2년) · 면적별 표는 면적이 2개 이상일 때만(1개면 큰 줄과 같은 값) ·
 * 사실 칸 = 공시가격(대표 면적) · 한 달 관리비 · 가까운 역(사용승인·세대수·동수는 띠 사실 줄로) · 출처·자료 마지막 달.
 * 이 단지 중위값·좌표는 싣지 않는다.
 */
export default function ComplexGlance({ summary: s }: { summary: PublicSummary }) {
  const areas = s.area_ranges ?? [];
  const officetel = isOfficetel({ real_estate_type_code: s.real_estate_type });
  const off = repOfficial(s);
  const kapt = kaptCostText(s.kapt_cost?.monthly_total);
  const station = s.subway?.[0];
  const rep = repAreaRange(s);
  const repRange = rep ? rep.recent6 ?? rep.recent24 : null;

  const facts: { label: string; value: string }[] = [];
  if (off) {
    const year = s.official_price?.year ? ` ${s.official_price.year}` : "";
    facts.push({ label: `공시가격${year} · 전용 ${Math.floor(off.prvuse_ar)}㎡`, value: formatKoreanPrice(wonToManwon(off.price_median)) });
  }
  if (kapt) {
    const ym = ymDot(s.kapt_cost?.ym);
    facts.push({ label: `한 달 관리비${ym ? ` · ${ym}` : ""}`, value: kapt });
  }
  if (station) facts.push({ label: "가까운 역", value: `${formatStationName(station.station_name)} ${formatDistance(station.distance_m)}` });

  const lastYm = ymDot(s.data_last_ym);
  const sources = [
    areas.length > 0 || off ? `국토교통부 ${[areas.length > 0 ? "실거래가" : null, off ? "공시가격" : null].filter(Boolean).join("·")}` : null,
    kapt ? "K-apt" : null,
  ].filter(Boolean);
  // 면적이 하나뿐이면 표는 큰 줄과 같은 값이라 뺀다 — 단 큰 줄을 못 그리는 경우(범위 없음)엔 지금처럼 표로
  const showTable = areas.length >= 2 || (areas.length === 1 && !repRange);

  return (
    <BrandCard as="section" aria-labelledby="complex-glance" className="p-4 sm:p-5 space-y-3" data-testid="complex-glance">
      <h2 id="complex-glance" className="text-sm font-bold text-brand-navy">한눈에 보기</h2>
      {rep && repRange && (
        <div data-testid="glance-headline">
          <p className="text-xs text-brand-muted">
            전용 {rep.exclusive_area}㎡ · {rep.recent6 ? "최근 6개월" : "최근 2년"} 실거래 {repRange.count}건
          </p>
          <p className="text-[22px] font-black tracking-tight text-brand-navy tabular-nums">{priceRangeText(repRange.min, repRange.max)}</p>
        </div>
      )}
      {showTable && (
        <table className="w-full text-sm" data-testid="glance-areas">
          <thead>
            <tr className="text-xs text-brand-muted text-left">
              <th scope="col" className="py-1 pr-2 font-medium whitespace-nowrap">전용면적</th>
              <th scope="col" className="py-1 font-medium">거래 범위</th>
              <th scope="col" className="py-1 pl-2 font-medium text-right whitespace-nowrap">건수</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const r = a.recent6 ?? a.recent24;
              return (
                <tr key={a.area_key} className="border-t border-brand-line-soft">
                  <th scope="row" className="py-1.5 pr-2 font-normal text-left whitespace-nowrap">{a.exclusive_area}㎡</th>
                  <td className="py-1.5">
                    {r ? (
                      <>
                        <b>{priceRangeText(r.min, r.max)}</b>
                        <span className="text-xs text-brand-muted"> · {a.recent6 ? "최근 6개월" : "최근 2년(6개월 거래 없음)"}</span>
                      </>
                    ) : "-"}
                  </td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">{r ? `${r.count}건` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {areas.length === 0 && (
        <p className="text-sm text-brand-navy">
          {officetel ? "오피스텔은 정부 실거래 자료를 아직 받지 않아요" : "최근 2년 정부 실거래 기록 없음"}
        </p>
      )}
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="glance-facts">
          {facts.map((f, i) => (
            <div
              key={f.label}
              // 칸이 홀수면 휴대폰 두 칸 줄에서 마지막 칸을 두 칸 폭으로(빈자리 없게)
              className={`bg-brand-bg rounded-[10px] p-2.5${i === facts.length - 1 && facts.length % 2 === 1 ? " col-span-2 sm:col-span-1" : ""}`}
            >
              <dt className="text-xs text-brand-muted">{f.label}</dt>
              <dd className="text-sm font-bold text-brand-navy">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(sources.length > 0 || lastYm) && (
        <p className="text-xs text-brand-muted">
          {sources.length > 0 ? `출처: ${sources.join(" · ")}` : ""}
          {lastYm ? `${sources.length > 0 ? " · " : ""}실거래 자료 ${lastYm}까지 · 직거래 제외` : ""}
        </p>
      )}
    </BrandCard>
  );
}
