"use client";

import { useId, useState } from "react";
import type { AreaPrice } from "@/types";
import { Card } from "@/components/ui/card";
import { formatKoreanPrice } from "@/lib/format";
import { LOAN_RULES_BASIS, isMetroRegion } from "@/lib/loan/loanRules";
import { metroSidoOf } from "@/lib/loan/regulation-codes";
import { secondLienLimit } from "@/lib/loan/secondLien";
import { AreaChips } from "./PriceRangeSection";
import { hasRange } from "./consumer-format";

interface Props {
  areaPrices: AreaPrice[];
  selected: number | null;
  onSelect: (area: number) => void;
  zone: "overheated" | "normal" | null;
  sido: string | null | undefined;
  /** 시군구 이름(규제 문구용) */
  regionLabel: string | null | undefined;
}

/** 금액 표시 — 0 은 "0원"(formatKoreanPrice 는 0 을 "-" 로 낸다) */
function money(n: number): string {
  return n > 0 ? formatKoreanPrice(n) : "0원";
}

/** 입력 글자 → 숫자(빈칸 = null). 금액은 숫자만, 금리는 소수점 허용 */
function toNumber(v: string): number | null {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
}

function Field({ id, label, value, onChange, unit, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; unit: string; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 px-2.5 text-sm"
        />
        <span className="text-xs text-gray-500 shrink-0">{unit}</span>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "text-base" : "text-xs"}`}>
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <b className={strong ? "text-blue-700" : ""}>{value}</b>
    </div>
  );
}

/** S4 · 내 돈으로 가능한가(참고 계산) — 입력은 화면 상태에만 있고 저장·전송하지 않는다. 금융사·상품·금리 숫자 표시 0 */
export default function LoanEstimateSection({ areaPrices, selected, onSelect, zone, sido, regionLabel }: Props) {
  const uid = useId();
  const [priceChoice, setPriceChoice] = useState<"min" | "max">("min");
  const [firstLien, setFirstLien] = useState("");
  const [deposit, setDeposit] = useState("");
  const [income, setIncome] = useState("");
  const [existing, setExisting] = useState("");
  const [rate, setRate] = useState("");

  const ap = areaPrices.find((a) => a.area_m2 === selected);
  if (!hasRange(ap)) return null;
  const price = priceChoice === "max" ? ap.price_max : ap.price_min;
  const ratePct = toNumber(rate);
  const r = secondLienLimit({
    price, zone, sido,
    firstLien: toNumber(firstLien), deposit: toNumber(deposit),
    income: toNumber(income), existingMonthly: toNumber(existing), ratePct,
  });
  const lien = toNumber(firstLien) ?? 0;
  const dep = toNumber(deposit) ?? 0;
  const place = regionLabel || "이 지역";
  const ruleText =
    zone === "overheated"
      ? `${place}는 규제지역 — 담보가치의 40%`
      : zone === "normal"
        ? `${place} 비규제 · 담보가치의 70%`
        : "담보가치의 70% · 규제지역이면 40%로 줄어요";
  const metro = isMetroRegion(metroSidoOf(sido));
  const used = Math.max(0, r.regionLimit - r.afterLiens);
  const barTotal = used + r.afterLiens;

  return (
    <Card className="p-4 space-y-3 border-2 border-blue-700" aria-labelledby="consumer-q4" data-testid="consumer-loan">
      <h2 id="consumer-q4" className="text-sm font-bold text-blue-700 tracking-wide">
        4 · 내 돈으로 가능한가 <span className="text-xs font-normal text-gray-500">(참고 계산)</span>
      </h2>
      <p className="text-xs text-gray-500">
        무주택 · 은행 기준 · {LOAN_RULES_BASIS} 규정 · 입력값은 저장되지 않아요
      </p>
      <AreaChips areaPrices={areaPrices} selected={selected} onSelect={onSelect} label="계산할 면적" />
      <div>
        <span className="block text-xs text-gray-500 mb-1">집값으로 볼 금액 (최근 거래 범위에서 고르기)</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="집값 고르기">
          {(ap.price_min === ap.price_max ? (["min"] as const) : (["min", "max"] as const)).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={priceChoice === k}
              onClick={() => setPriceChoice(k)}
              className={`h-8 px-3 rounded-full border text-xs ${priceChoice === k ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
            >
              {k === "min" ? `보수적 ${formatKoreanPrice(ap.price_min)}` : formatKoreanPrice(ap.price_max)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Field id={`${uid}-first`} label="이미 있는 담보대출(선순위)" value={firstLien} onChange={setFirstLien} unit="만원" placeholder="0" />
        <Field id={`${uid}-dep`} label="임차보증금 (세입자가 있으면)" value={deposit} onChange={setDeposit} unit="만원" placeholder="0" />
        <Field id={`${uid}-inc`} label="연소득 (선택 · 넣으면 소득 기준도 계산)" value={income} onChange={setIncome} unit="만원" placeholder="예: 4800" />
        <Field id={`${uid}-ext`} label="기존 대출 월 상환 (선택)" value={existing} onChange={setExisting} unit="만원" placeholder="0" />
        <Field id={`${uid}-rate`} label="금리 (선택 · 넣으면 월 상환액)" value={rate} onChange={setRate} unit="연 %" placeholder="예: 4.0" />
      </div>
      <div className="rounded-lg bg-blue-50 p-3 space-y-1.5" data-testid="consumer-loan-result">
        <Row label={`지역 규칙 · ${ruleText}${metro ? " · 수도권 최대 6억" : ""}`} value={formatKoreanPrice(r.regionLimit)} />
        {lien > 0 && <Row label="− 선순위 대출" value={formatKoreanPrice(lien)} />}
        {dep > 0 && <Row label="− 임차보증금" value={formatKoreanPrice(dep)} />}
        {r.afterLiens > 0 ? (
          <Row label="추가로 가능한 담보대출(담보 기준)" value={`약 ${formatKoreanPrice(r.afterLiens)}`} strong={r.incomeLimit == null} />
        ) : (
          <p className="text-sm font-bold">지금은 담보 여력이 없어요</p>
        )}
        {r.incomeSkip === "no-rate" && <p className="text-xs text-gray-600">금리를 넣으면 소득 기준도 계산</p>}
        {r.incomeLimit != null && (
          <>
            <Row label={`소득 기준 · DSR 40% · 스트레스 금리 ${r.stressRate}% · 30년`} value={`약 ${money(r.incomeLimit)}`} />
            <Row label="둘 중 작은 값" value={r.loan > 0 ? `약 ${money(r.loan)}` : "0원"} strong />
          </>
        )}
        {r.monthly != null && ratePct != null && (
          <Row label={`월 상환 · 30년 원리금균등 · 연 ${ratePct}%`} value={`약 ${formatKoreanPrice(r.monthly)}`} />
        )}
        {barTotal > 0 && (
          <div aria-hidden="true">
            <div className="flex h-3.5 rounded-full overflow-hidden bg-slate-200">
              <i className="bg-slate-400" style={{ width: `${(used / barTotal) * 100}%` }} />
              <i className="bg-blue-700" style={{ width: `${(r.afterLiens / barTotal) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>선순위·보증금 {money(used)}</span>
              <span>추가 가능 {money(r.afterLiens)}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        실제 한도는 소득·신용·기존 대출로 달라져요. 금융사별 조건은{" "}
        <a href="https://finlife.fss.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">금융감독원 금융상품 비교공시</a>
        {" · "}
        <a href="https://portal.kfb.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">은행연합회 소비자포털</a>
        에서 비교해 보세요.
      </p>
    </Card>
  );
}
