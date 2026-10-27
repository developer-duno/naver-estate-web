import { formatKoreanPrice } from "@/lib/format";
import { formatDistance, formatStationName } from "@/lib/subway-format";
import { repOfficial } from "@/lib/seo/complex-page";
import {
  isOfficetel,
  kaptCostText,
  priceRangeText,
  wonToManwon,
  ymDot,
} from "@/components/complex/consumer/consumer-format";
import type { PublicSummary } from "@/types/public-summary";

/**
 * '한눈에 보기' 사실 표(서버가 그림, 세션 483 PR 3b · 결정 23 A안) — h1 바로 아래.
 * 지금 소비자 화면에 이미 보이는 값만: 면적별 최근 6개월 범위·건수(없으면 2년 범위) · 공시가격(대표 면적) ·
 * 한 달 관리비 · 가까운 역 1곳 · 사용승인·세대수·동수 · 출처·자료 마지막 달. 이 단지 중위값·좌표는 싣지 않는다.
 */
export default function ComplexGlance({ summary: s }: { summary: PublicSummary }) {
  const areas = s.area_ranges ?? [];
  const officetel = isOfficetel({ real_estate_type_code: s.real_estate_type });
  const off = repOfficial(s);
  const kapt = kaptCostText(s.kapt_cost?.monthly_total);
  const station = s.subway?.[0];

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
  if (s.use_approve_year != null) facts.push({ label: "사용승인", value: `${s.use_approve_year}년` });
  if (s.household_count != null) facts.push({ label: "세대수", value: `${s.household_count.toLocaleString()}세대` });
  if (s.building_count != null) facts.push({ label: "동수", value: `${s.building_count}개동` });

  const lastYm = ymDot(s.data_last_ym);
  const sources = [
    areas.length > 0 || off ? `국토교통부 ${[areas.length > 0 ? "실거래가" : null, off ? "공시가격" : null].filter(Boolean).join("·")}` : null,
    kapt ? "K-apt" : null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="complex-glance" className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="complex-glance">
      <h2 id="complex-glance" className="text-sm font-bold text-gray-900">한눈에 보기</h2>
      {areas.length > 0 ? (
        <table className="w-full text-sm" data-testid="glance-areas">
          <thead>
            <tr className="text-xs text-gray-500 text-left">
              <th scope="col" className="py-1 pr-2 font-medium whitespace-nowrap">전용면적</th>
              <th scope="col" className="py-1 font-medium">거래 범위</th>
              <th scope="col" className="py-1 pl-2 font-medium text-right whitespace-nowrap">건수</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const r = a.recent6 ?? a.recent24;
              return (
                <tr key={a.area_key} className="border-t border-gray-100">
                  <th scope="row" className="py-1.5 pr-2 font-normal text-left whitespace-nowrap">{a.exclusive_area}㎡</th>
                  <td className="py-1.5">
                    {r ? (
                      <>
                        <b>{priceRangeText(r.min, r.max)}</b>
                        <span className="text-xs text-gray-500"> · {a.recent6 ? "최근 6개월" : "최근 2년(6개월 거래 없음)"}</span>
                      </>
                    ) : "-"}
                  </td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">{r ? `${r.count}건` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-700">
          {officetel ? "오피스텔은 정부 실거래 자료를 아직 받지 않아요" : "최근 2년 정부 실거래 기록 없음"}
        </p>
      )}
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="glance-facts">
          {facts.map((f) => (
            <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
              <dt className="text-xs text-gray-500">{f.label}</dt>
              <dd className="text-sm font-bold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(sources.length > 0 || lastYm) && (
        <p className="text-xs text-gray-400">
          {sources.length > 0 ? `출처: ${sources.join(" · ")}` : ""}
          {lastYm ? `${sources.length > 0 ? " · " : ""}실거래 자료 ${lastYm}까지 · 직거래 제외` : ""}
        </p>
      )}
    </section>
  );
}
