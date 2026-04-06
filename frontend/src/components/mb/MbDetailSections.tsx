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

/** re-export — 기존 import 호환 유지 */
export { EnvironmentSection } from "./MbEnvironmentSection";

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
