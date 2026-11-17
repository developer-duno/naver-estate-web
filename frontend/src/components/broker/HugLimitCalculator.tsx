"use client";

import { useId, useState, type ReactNode } from "react";
import { withCommas } from "@/components/SecondMortgageCalculator";
import { parseAmount } from "@/lib/second-mortgage";
import {
  HUG_JEONSE_RATIO_PCT,
  HUG_NOT_COVERED,
  HUG_OFFICIAL_PRICE_PCT,
  HUG_SENIOR_CAP_PCT,
  HUG_SOURCES,
  calcHugLimit,
  conversionRateText,
  depositCapLabel,
  formatHugWon,
  hugBasisLine,
  type HugPriceMode,
  type HugRegion,
} from "@/lib/broker/hug-guarantee";

/**
 * 전세보증 한도 계산기(세션 520 · B37 PR 5) — /broker/jeonse-guarantee. 계산 = lib/broker/hug-guarantee.ts.
 * 입력은 화면 상태에만 있고 어디에도 저장·전송하지 않는다. 결과는 원문의 숫자 조건 세 가지에 「들어감/넘음」만 말한다.
 */
type HouseType = "apt" | "officetel" | "villa";

const HOUSE_TYPES: { value: HouseType; label: string; directGuide: string }[] = [
  {
    value: "apt",
    label: "아파트",
    directGuide:
      "HUG는 KB·한국부동산원 시세를 먼저 씁니다(최저층은 하위평균가). 없으면 공시가격의 140% → 안심전세 앱 하한가 → 1년 안 등기부 매매가 → 준공 1년 안이면 분양가의 90%.",
  },
  {
    value: "officetel",
    label: "오피스텔",
    directGuide:
      "HUG는 KB 시세 하위평균가를 먼저 씁니다. 없으면 국세청 기준시가의 140% → 안심전세 앱 하한가 → 1년 안 등기부 매매가 → 준공 1년 안이면 분양가의 90%.",
  },
  {
    value: "villa",
    label: "연립·다세대",
    directGuide: "HUG는 공동주택가격(공시가격)의 140%를 먼저 씁니다. 없으면 안심전세 앱 하한가 → 1년 안 등기부 매매가.",
  },
];

const REGIONS: { value: HugRegion; label: string }[] = [
  { value: "capital", label: "수도권(서울·인천·경기)" },
  { value: "other", label: "그 외 지역" },
];

const PRICE_MODES: { value: HugPriceMode; label: string }[] = [
  { value: "direct", label: "금액 직접" },
  { value: "official", label: "공시가격으로" },
];

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";
const labelCls = "text-sm font-bold text-brand-navy";
const hintCls = "text-xs text-brand-muted leading-relaxed";
const inputCls =
  "h-12 w-full rounded-[10px] border border-brand-line bg-white px-3.5 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange";

function Choices<T extends string>({ name, options, value, onChange }: {
  name: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-auto rounded-lg border px-3 text-sm font-bold ${
            value === o.value
              ? "border-brand-navy bg-brand-navy text-white"
              : "border-brand-line bg-white text-brand-navy hover:bg-brand-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AmountInput({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelCls}>{label}</label>
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
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm leading-relaxed ${
        ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      <em className="whitespace-nowrap font-black not-italic">{ok ? "✓ 들어감" : "✗ 넘음"}</em>
      <span>{children}</span>
    </li>
  );
}

export default function HugLimitCalculator() {
  const id = useId();
  const [houseType, setHouseType] = useState<HouseType>("apt");
  const [region, setRegion] = useState<HugRegion>("capital");
  const [priceMode, setPriceMode] = useState<HugPriceMode>("direct");
  const [price, setPrice] = useState("");
  const [senior, setSenior] = useState("");
  const [deposit, setDeposit] = useState("");
  const [rent, setRent] = useState("");

  const result = calcHugLimit({
    region,
    priceMode,
    priceWon: parseAmount(price),
    seniorWon: parseAmount(senior),
    depositWon: parseAmount(deposit),
    monthlyRentWon: parseAmount(rent),
  });
  const house = HOUSE_TYPES.find((h) => h.value === houseType)!;
  const officialLabel = houseType === "officetel" ? "기준시가(국세청)" : "공시가격";
  const W = (n: number) => formatHugWon(n);
  const F = (n: number) => formatHugWon(n, false);

  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-4">
      <section aria-label="입력" className={`${cardClass} flex flex-col gap-4`}>
        <div className="flex flex-col gap-1.5">
          <p className={labelCls}>집 종류</p>
          <Choices name="집 종류" options={HOUSE_TYPES} value={houseType} onChange={setHouseType} />
          <p className={hintCls}>단독·다가구는 다른 세입자 보증금까지 따지는 조건이 있어 다루지 않습니다.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={labelCls}>지역</p>
          <Choices name="지역" options={REGIONS} value={region} onChange={setRegion} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={labelCls}>주택가격</p>
          <Choices name="주택가격 넣는 방법" options={PRICE_MODES} value={priceMode} onChange={setPriceMode} />
          <AmountInput
            id={`${id}-price`}
            label={priceMode === "official" ? officialLabel : "주택가격 금액"}
            value={price}
            onChange={setPrice}
            placeholder={priceMode === "official" ? "예: 200,000,000" : "예: 280,000,000"}
          />
          {priceMode === "direct" ? (
            <p className={hintCls}>{house.directGuide}</p>
          ) : (
            result.status === "ok" && (
              <p className={hintCls}>
                × {HUG_OFFICIAL_PRICE_PCT}% ={" "}
                <b className="text-brand-orange-text">{W(result.housePriceWon)}</b>을 주택가격으로 씁니다.
                {houseType !== "villa" && " (아파트·오피스텔은 시세가 없을 때 쓰는 방법)"}
              </p>
            )
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <AmountInput id={`${id}-senior`} label="선순위채권 등" value={senior} onChange={setSenior} placeholder="없으면 0" />
          <p className={hintCls}>등기부 을구의 근저당 금액과 등기일자(원문 표현) — 내 보증금보다 먼저 받는 채권</p>
        </div>
        <AmountInput id={`${id}-deposit`} label="전세보증금" value={deposit} onChange={setDeposit} placeholder="예: 180,000,000" />
        <AmountInput id={`${id}-rent`} label="월세 (있으면)" value={rent} onChange={setRent} placeholder="없으면 0" />
      </section>

      <section aria-labelledby={`${id}-result`} className={`${cardClass} flex flex-col gap-3`} aria-live="polite">
        <h2 id={`${id}-result`} className="text-sm font-bold text-brand-muted">
          HUG 산식 상한(보증한도)
        </h2>
        {result.status === "ok" ? (
          <>
            <p className="-mt-2 text-3xl font-black tracking-tight text-brand-navy tabular-nums" data-testid="hug-limit">
              {W(Math.max(result.limitWon, 0))}
            </p>
            {result.limitWon < 0 && (
              <p className="text-sm text-red-700">선순위채권 등이 이미 주택가격의 {HUG_JEONSE_RATIO_PCT}%를 넘습니다.</p>
            )}
            <p className="rounded-lg bg-brand-bg px-3 py-2 text-sm text-brand-muted tabular-nums" data-testid="hug-formula">
              {F(result.housePriceWon)} × {HUG_JEONSE_RATIO_PCT}% − {F(result.seniorWon)} = {F(result.limitWon)}
            </p>
            <ul className="flex flex-col gap-1.5">
              <Check ok={result.depositFits}>
                {result.depositFits
                  ? result.limitWon === result.depositWon
                    ? `전세보증금 ${W(result.depositWon)}이 한도와 같음`
                    : `전세보증금 ${W(result.depositWon)}이 한도 안 — ${W(result.limitWon - result.depositWon)} 남음`
                  : `전세보증금 ${W(result.depositWon)}이 한도보다 ${W(result.depositWon - Math.max(result.limitWon, 0))} 많음`}
              </Check>
              <Check ok={result.seniorFits}>
                {`선순위채권 ${result.seniorRatioText}% (${HUG_SENIOR_CAP_PCT}% ${result.seniorFits ? "이내" : "넘음"})`}
              </Check>
              <Check ok={result.capFits}>
                {result.convertedDepositWon == null
                  ? `보증금 ${W(result.depositWon)} (${depositCapLabel(region)} ${result.capFits ? "이하" : "넘음"})`
                  : `환산 보증금 ${W(result.convertedDepositWon)} (보증금 + 월세×12 ÷ ${conversionRateText()}) · ${depositCapLabel(region)} ${result.capFits ? "이하" : "넘음"}`}
              </Check>
            </ul>
          </>
        ) : (
          <p className="rounded-lg bg-brand-bg px-3 py-3 text-sm text-brand-muted" data-testid="hug-guide">
            주택가격과 전세보증금을 넣으면 한도가 보입니다.
          </p>
        )}
        <p className="border-t border-brand-line-soft pt-3 text-xs text-brand-muted leading-relaxed">{hugBasisLine()}</p>
        <div className="text-sm text-brand-muted">
          <h3 className="font-bold text-brand-navy">이 계산에 넣지 않은 심사 조건</h3>
          <ul className="mt-1 list-disc pl-5 leading-relaxed">
            {HUG_NOT_COVERED.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {HUG_SOURCES.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-orange-text underline hover:text-brand-navy"
              >
                {s.label} 보기 ↗
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
