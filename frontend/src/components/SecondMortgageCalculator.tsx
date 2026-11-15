"use client";

import { useId, useState } from "react";
import { calcSecondMortgage, formatWonKorean, parseAmount } from "@/lib/second-mortgage";

/**
 * 후순위 대출 한도·이자 계산기(세션 508) — 홈 대출 판과 /tools/second-mortgage 가 같이 쓴다.
 * 입력은 화면 상태에만 있고 어디에도 저장·전송하지 않는다. 비율·이자율은 기본값 없이 손님이 고른다(금융위 등록 전).
 */
const LTV_CHOICES = [60, 70, 80] as const;

/** 금액 칸 자릿수 상한 — 15자리(999조)면 Number 정밀도 안이고, 그 이상은 「∞」·반올림 글자가 찍혔다(세션 508 보완) */
export const MAX_AMOUNT_DIGITS = 15;

/** 금액 칸 — 숫자만 남기고(앞 15자리까지) 쉼표를 찍는다 */
export function withCommas(text: string): string {
  const digits = text.replace(/[^\d]/g, "").slice(0, MAX_AMOUNT_DIGITS);
  return digits === "" ? "" : Number(digits).toLocaleString();
}

const inputCls =
  "h-12 w-full rounded-[10px] border border-brand-line bg-white px-3.5 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange";

function AmountField({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const n = parseAmount(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-brand-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(withCommas(e.target.value))}
          className={inputCls}
        />
        <span className="shrink-0 text-sm text-brand-muted">원</span>
      </div>
      {n != null && n > 0 && <p className="text-xs text-brand-muted">{formatWonKorean(n)}</p>}
    </div>
  );
}

export default function SecondMortgageCalculator() {
  const id = useId();
  const [price, setPrice] = useState("");
  const [debt, setDebt] = useState("");
  const [ltvChoice, setLtvChoice] = useState<number | null>(null);
  const [ltvText, setLtvText] = useState("");
  const [rate, setRate] = useState("");

  const ltvPct = ltvChoice ?? parseAmount(ltvText);
  const result = calcSecondMortgage({
    priceWon: parseAmount(price),
    debtWon: parseAmount(debt),
    ltvPct,
    ratePct: parseAmount(rate),
  });

  return (
    <div className="flex flex-col gap-4">
      <AmountField id={`${id}-price`} label="우리 집 시세" value={price} onChange={setPrice} placeholder="예: 500,000,000" />
      <AmountField id={`${id}-debt`} label="지금 남아 있는 대출" value={debt} onChange={setDebt} placeholder="없으면 0" />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] text-brand-muted">담보 인정 비율</legend>
        <div className="flex flex-wrap items-center gap-2">
          {LTV_CHOICES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={ltvChoice === v}
              onClick={() => { setLtvChoice(v); setLtvText(""); }}
              className={`h-11 min-w-16 rounded-[10px] border px-3 text-sm font-bold ${
                ltvChoice === v
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-brand-line bg-white text-brand-navy hover:bg-brand-bg"
              }`}
            >
              {v}%
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <label htmlFor={`${id}-ltv`} className="sr-only">담보 인정 비율 직접 입력</label>
            <input
              id={`${id}-ltv`}
              inputMode="decimal"
              autoComplete="off"
              value={ltvText}
              placeholder="직접 입력"
              onChange={(e) => { setLtvText(e.target.value.replace(/[^\d.]/g, "")); setLtvChoice(null); }}
              className={`${inputCls} h-11 w-28`}
            />
            <span className="text-sm text-brand-muted">%</span>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-rate`} className="text-[13px] text-brand-muted">연 이자율</label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-rate`}
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            placeholder="연 이자율을 입력하세요"
            onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
            className={inputCls}
          />
          <span className="shrink-0 text-sm text-brand-muted">%</span>
        </div>
      </div>

      <div aria-live="polite">
        {result.status === "ok" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] bg-brand-bg p-3.5">
              <p className="text-xs text-brand-muted">예상 추가 한도</p>
              <p className="mt-1 text-lg font-black text-brand-navy sm:text-[22px]" data-testid="sm-limit">
                {formatWonKorean(result.limitWon)}
              </p>
            </div>
            <div className="rounded-[10px] bg-brand-bg p-3.5">
              <p className="text-xs text-brand-muted">매달 이자(이자만 낼 때)</p>
              <p className="mt-1 text-lg font-black text-brand-navy sm:text-[22px]" data-testid="sm-monthly">
                {`${result.monthlyInterestWon.toLocaleString()}원`}
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-[10px] bg-brand-bg p-3.5 text-sm text-brand-muted" data-testid="sm-guide">
            {result.status === "invalid-ltv" ? "담보 인정 비율은 0보다 크고 100 이하로 넣어 주세요." : "값을 넣으면 계산됩니다"}
          </p>
        )}
      </div>

      <p className="text-xs text-brand-muted">계산 결과는 입력하신 값으로 계산한 예시입니다.</p>
    </div>
  );
}
