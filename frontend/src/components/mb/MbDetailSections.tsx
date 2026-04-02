"use client";

import type { MbApartment, MbPrice } from "@/types";
import { formatKoreanPrice } from "@/lib/format";

interface SectionProps {
  apartment: MbApartment;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value ?? "-"}</dd>
    </div>
  );
}

/** 대기질 등급 색상 뱃지 */
const AIR_GRADE_STYLES: Record<string, string> = {
  "좋음": "bg-green-100 text-green-800 border-green-300",
  "보통": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "나쁨": "bg-orange-100 text-orange-800 border-orange-300",
  "매우나쁨": "bg-red-100 text-red-800 border-red-300",
};

function AirGradeBadge({ grade }: { grade: string }) {
  const style = AIR_GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-600 border-gray-300";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${style}`}>{grade}</span>;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
      <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">{title}</h3>
      {children}
    </section>
  );
}

/** 개요 — 기본정보 + 시공사 */
export function OverviewSection({ apartment: a }: SectionProps) {
  const b = a.builder_info;
  return (
    <SectionCard title="개요">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <InfoRow label="단지명" value={a.name} />
        <InfoRow label="주소" value={a.address ?? a.road_address} />
        <InfoRow label="지역" value={`${a.region} ${a.gu ?? ""} ${a.dong ?? ""}`.trim()} />
        <InfoRow label="세대수" value={a.units?.toLocaleString()} />
        <InfoRow label="완공" value={a.completion} />
        <InfoRow label="난방" value={a.heating} />
        <InfoRow label="최고층" value={a.max_floor ? `${a.max_floor}층` : undefined} />
        <InfoRow label="주차비율" value={a.parking_ratio ? `${a.parking_ratio}%` : undefined} />
        <InfoRow label="용적률" value={a.floor_area_ratio ? `${a.floor_area_ratio}%` : undefined} />
        <InfoRow label="건폐율" value={a.building_coverage_ratio ? `${a.building_coverage_ratio}%` : undefined} />
        <InfoRow label="규제지역" value={a.is_regulated ? "예" : a.is_regulated === false ? "아니오" : undefined} />
        <InfoRow label="시공사" value={a.builder} />
        {b && (
          <>
            <InfoRow label="부채비율" value={b.debt_ratio != null ? `${b.debt_ratio}%` : undefined} />
            <InfoRow label="신용등급" value={b.credit_grade} />
            <InfoRow label="HUG 보증" value={b.hug_guarantee ? "가능" : b.hug_guarantee === false ? "불가" : undefined} />
          </>
        )}
      </dl>
    </SectionCard>
  );
}

/** 분양 정보 — 혜택 + 분양가 */
export function PresaleSection({ apartment: a }: SectionProps) {
  const prices = a.prices;
  return (
    <SectionCard title="분양 정보">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <InfoRow label="분양 최저가" value={a.presale_min_price != null ? formatKoreanPrice(a.presale_min_price) : undefined} />
        <InfoRow label="분양 최고가" value={a.presale_max_price != null ? formatKoreanPrice(a.presale_max_price) : undefined} />
        <InfoRow label="평당가" value={a.presale_pp != null ? formatKoreanPrice(a.presale_pp) : undefined} />
        <InfoRow label="분양유형" value={a.presale_type} />
        <InfoRow label="분양단계" value={a.presale_stage} />
        <InfoRow label="입주시기" value={a.presale_move_in} />
        <InfoRow label="할인율" value={a.discount_pct != null ? `${a.discount_pct}%` : undefined} />
        <InfoRow label="발코니 무상" value={a.balcony_free ? "O" : a.balcony_free === false ? "X" : undefined} />
        <InfoRow label="옵션 무상" value={a.option_free ? "O" : a.option_free === false ? "X" : undefined} />
        <InfoRow label="캐시백" value={a.cashback != null ? formatKoreanPrice(a.cashback) : undefined} />
      </dl>

      {prices && prices.length > 0 ? (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600">타입</th>
                <th className="px-3 py-2 text-right text-gray-600">전용면적</th>
                <th className="px-3 py-2 text-right text-gray-600">공급면적</th>
                <th className="px-3 py-2 text-right text-gray-600">분양가</th>
                <th className="px-3 py-2 text-right text-gray-600">평당가</th>
                <th className="px-3 py-2 text-right text-gray-600">세대수</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p: MbPrice) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">{p.house_type ?? "-"}</td>
                  <td className="px-3 py-1.5 text-right">{p.area != null ? `${p.area}㎡` : "-"}</td>
                  <td className="px-3 py-1.5 text-right">{p.supply_area != null ? `${p.supply_area}㎡` : "-"}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{p.price != null ? formatKoreanPrice(p.price) : "-"}</td>
                  <td className="px-3 py-1.5 text-right">{p.pp != null ? formatKoreanPrice(p.pp) : "-"}</td>
                  <td className="px-3 py-1.5 text-right">{p.supply_count ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400">분양가 데이터가 없습니다.</p>
      )}
    </SectionCard>
  );
}

/** 주변 환경 — 인프라 + 학군 + 교통 */
export function EnvironmentSection({ apartment: a }: SectionProps) {
  const infra = a.infra;
  const school = a.school;
  const transport = a.transport;
  const hasData = infra ?? school ?? transport;

  if (!hasData) {
    return (
      <SectionCard title="주변 환경">
        <p className="text-sm text-gray-400">주변 환경 데이터가 없습니다.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="주변 환경">
      {infra && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">인프라</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ["병원", infra.hospital, infra.hospital_dist],
              ["마트", infra.mart, infra.mart_dist],
              ["편의점", infra.conv, infra.conv_dist],
              ["카페", infra.cafe, infra.cafe_dist],
              ["문화시설", infra.culture, infra.culture_dist],
              ["은행", infra.bank, infra.bank_dist],
              ["약국", infra.pharmacy, infra.pharmacy_dist],
              ["공원", infra.park, infra.park_dist],
            ] as const).map(([name, count, dist]) => (
              <div key={name} className="flex flex-col">
                <dt className="text-xs text-gray-500">{name}</dt>
                <dd className="text-sm">
                  {count != null ? `${count}개` : "-"}
                  {dist != null && <span className="text-gray-400 ml-1">({dist}m)</span>}
                </dd>
              </div>
            ))}
            {infra.subway_dist != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">지하철</dt>
                <dd className="text-sm">{infra.subway_dist}m</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* 대기질 — 에어코리아 */}
      {infra?.air_grade && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">대기질</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col">
              <dt className="text-xs text-gray-500">종합 등급</dt>
              <dd className="text-sm"><AirGradeBadge grade={infra.air_grade} /></dd>
            </div>
            {infra.air_pm10 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">PM10</dt>
                <dd className="text-sm">{infra.air_pm10} <span className="text-gray-400">μg/m³</span></dd>
              </div>
            )}
            {infra.air_pm25 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">PM2.5</dt>
                <dd className="text-sm">{infra.air_pm25} <span className="text-gray-400">μg/m³</span></dd>
              </div>
            )}
            {infra.air_o3 != null && (
              <div className="flex flex-col">
                <dt className="text-xs text-gray-500">오존</dt>
                <dd className="text-sm">{infra.air_o3} <span className="text-gray-400">ppm</span></dd>
              </div>
            )}
            {infra.air_station_name && (
              <div className="flex flex-col col-span-2">
                <dt className="text-xs text-gray-500">측정소</dt>
                <dd className="text-sm text-gray-600">
                  {infra.air_station_name}
                  {infra.air_station_dist != null && <span className="text-gray-400 ml-1">({infra.air_station_dist}m)</span>}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* 응급의료기관 */}
      {infra?.emergency_hospital != null && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">응급의료</h4>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoRow label="기관 수 (3km)" value={`${infra.emergency_hospital}개`} />
            <InfoRow label="최근접 거리" value={infra.emergency_hospital_dist != null ? `${infra.emergency_hospital_dist}m` : undefined} />
            <InfoRow label="병상 수" value={infra.emergency_beds ? `${infra.emergency_beds}개` : undefined} />
            <InfoRow label="기관 등급" value={infra.emergency_level || undefined} />
          </dl>
        </div>
      )}

      {school && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">학군</h4>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoRow label="학군 점수" value={school.school_score} />
            <InfoRow label="학군 등급" value={school.school_grade} />
          </dl>
        </div>
      )}

      {transport && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">교통</h4>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoRow label="지하철" value={transport.subway_name} />
            <InfoRow label="노선" value={transport.subway_lines} />
            <InfoRow label="지하철 거리" value={transport.subway_dist != null ? `${transport.subway_dist}m` : undefined} />
            <InfoRow label="버스 노선" value={transport.bus_routes ? `${transport.bus_routes}개` : undefined} />
            <InfoRow label="IC 거리" value={transport.ic_dist != null ? `${(transport.ic_dist / 1000).toFixed(1)}km` : undefined} />
            <InfoRow label="KTX 거리" value={transport.ktx_dist != null ? `${(transport.ktx_dist / 1000).toFixed(1)}km` : undefined} />
          </dl>
        </div>
      )}
    </SectionCard>
  );
}

/** 거래 통계 */
export function TradeStatsSection({ apartment: a }: SectionProps) {
  const ts = a.trade_stats;
  if (!ts) {
    return (
      <SectionCard title="거래 통계">
        <p className="text-sm text-gray-400">거래 통계 데이터가 없습니다.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="거래 통계">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <InfoRow label="인근 시세 중위값" value={ts.nearby_median != null ? formatKoreanPrice(ts.nearby_median) : undefined} />
        <InfoRow label="최근 6개월 거래" value={ts.recent_trades_6m != null ? `${ts.recent_trades_6m}건` : undefined} />
        <InfoRow label="전세율" value={ts.jeonse_rate != null ? `${ts.jeonse_rate.toFixed(1)}%` : undefined} />
        <InfoRow label="PIR" value={ts.pir != null ? ts.pir.toFixed(1) : undefined} />
        <InfoRow label="PSR" value={ts.psr != null ? ts.psr.toFixed(1) : undefined} />
        <InfoRow label="평균층" value={ts.avg_floor != null ? `${ts.avg_floor.toFixed(1)}층` : undefined} />
        <InfoRow label="층 범위" value={ts.floor_range} />
        <InfoRow label="6개월 취소율" value={ts.cancel_ratio_6m != null ? `${ts.cancel_ratio_6m.toFixed(1)}%` : undefined} />
      </dl>
    </SectionCard>
  );
}
