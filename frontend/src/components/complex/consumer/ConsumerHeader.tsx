"use client";

import type { Complex } from "@/types";
import ComplexHeader from "@/components/complex/ComplexHeader";
import { formatKoreanPrice } from "@/lib/format";
import { priceRangeText } from "./consumer-format";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  /** 한 줄 요약 — null 이면 생략(오피스텔 등) */
  summary: ConsumerSummary | null;
}

/**
 * 머리 요약(보완 F2·A-5) — 대출 카드와 같은 집값 단계. range = 6개월(또는 2년) 범위 + 가진 집 기준 한도(선순위 0),
 * manual = 최근 2년 기록이 없어 한도 숫자는 생략. zoneUnknown 이면 끝에 "(규제지역이면 더 낮아요)".
 */
export type ConsumerSummary =
  | { kind: "range"; area: number | null; period: "6m" | "2y"; min: number; max: number; ltv: number; zoneUnknown: boolean }
  | { kind: "manual" };

function SummaryLine({ s }: { s: ConsumerSummary }) {
  if (s.kind === "manual") {
    return <>최근 2년 정부 실거래 기록 없음 · 담보대출 한도는 아래 4번에서 집값을 넣어 계산해요</>;
  }
  return (
    <>
      {s.area != null ? `${s.area}㎡ 기준 ` : ""}최근 {s.period === "2y" ? "2년 " : ""}거래{" "}
      <b className="text-gray-900">{priceRangeText(s.min, s.max)}</b>
      {" · "}담보대출 한도 최대 약 <b className="text-blue-700">{formatKoreanPrice(s.ltv)}</b>
      <span className="text-xs text-gray-500"> (가진 집 담보 · 선순위 없을 때 · 참고)</span>
      {s.zoneUnknown && <span className="text-xs text-gray-500"> (규제지역이면 더 낮아요)</span>}
    </>
  );
}

/** S0 머리 — 이름·관심·비교(기존 ComplexHeader) + 사실 칩 + 한 줄 요약(세션 482 PR 1b) */
export default function ConsumerHeader({ complex, summary, ...header }: Props) {
  const chips: string[] = [];
  const addr = complex.address || complex.cortar_address;
  if (addr) chips.push(addr);
  const year = complex.use_approve_ymd?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) chips.push(`${year}년 사용승인`);
  if (complex.total_household_count != null) chips.push(`${complex.total_household_count.toLocaleString()}세대`);
  if (complex.total_dong_count != null) chips.push(`${complex.total_dong_count}개동`);

  return (
    <div className="space-y-2">
      <ComplexHeader complex={complex} {...header} />
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="단지 기본 사실">
          {chips.map((c) => (
            <li key={c} className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5">{c}</li>
          ))}
        </ul>
      )}
      {summary && (
        <p className="text-sm text-gray-600" data-testid="consumer-summary">
          <SummaryLine s={summary} />
        </p>
      )}
    </div>
  );
}
