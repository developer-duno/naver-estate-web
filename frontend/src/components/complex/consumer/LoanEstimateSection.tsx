"use client";

import { useId, useState, type ReactNode } from "react";
import type { AreaPrice } from "@/types";
import { Card } from "@/components/ui/card";
import { formatKoreanPrice } from "@/lib/format";
import { LOAN_RULES_BASIS, isMetroRegion } from "@/lib/loan/loanRules";
import { metroSidoOf } from "@/lib/loan/regulation-codes";
import { livingFundCapApplies, secondLienLimit, type LoanMode } from "@/lib/loan/secondLien";
import LoadRetry from "./LoadRetry";
import { AreaChips } from "./PriceRangeSection";
import { hasRange, priceStage, topicParticle } from "./consumer-format";

interface Props {
  areaPrices: AreaPrice[];
  selected: number | null;
  onSelect: (area: number) => void;
  zone: "overheated" | "normal" | null;
  sido: string | null | undefined;
  /** 시군구 이름(규제 문구용) */
  regionLabel: string | null | undefined;
  /** 선택 면적의 2년 범위(B1 two_year) — 6개월 범위가 없을 때 집값 칩(결정 12) */
  twoYear?: { min: number; max: number } | null;
  /** 공시가격(만원) — 직접 입력 단계의 참고 글자만(값으로 채우지 않는다) */
  officialManwon?: number | null;
  /** 집값 단계에 쓰는 자료를 불러오지 못했으면 다시 시도(보완 A-4) */
  onRetry?: () => void;
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

function Row({ label, value, strong, tail }: { label: string; value: string; strong?: boolean; tail?: string }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "text-base" : "text-xs"}`}>
      <span className={strong ? "font-bold" : ""}>
        {label}
        {tail && <span className="text-xs font-normal text-gray-500"> {tail}</span>}
      </span>
      <b className={`shrink-0 whitespace-nowrap ${strong ? "text-blue-700" : ""}`}>{value}</b>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 px-3 rounded-full border text-xs ${on ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
    >
      {children}
    </button>
  );
}

/** 지역 규칙 글자 — 구입 모드의 규제지역은 가격별 상한까지 적는다(보완 F7). 지역 이름이 없으면 "이 단지 지역은" */
function ruleTextOf(mode: LoanMode, zone: Props["zone"], regionLabel: string | null | undefined): string {
  const place = regionLabel || "이 단지 지역";
  if (zone === "overheated") {
    const head = `${place}${topicParticle(place)} 규제지역 — 담보가치의 40%`;
    return mode === "buy" ? `${head}, 15억 초과는 4억·25억 초과는 2억까지` : head;
  }
  if (zone === "normal") return `${place} 비규제 · 담보가치의 70%`;
  return "담보가치의 70% · 규제지역이면 40%로 줄어요";
}

/**
 * S4 · 내 돈으로 가능한가(참고 계산) — 두 모드(결정 11: 기본 '이미 가진 집') · 집값 단계(결정 12: 6개월 → 2년 → 직접 입력).
 * 입력은 화면 상태에만 있고 저장·전송하지 않는다. 금융사·상품·금리 숫자 표시 0.
 */
export default function LoanEstimateSection({
  areaPrices, selected, onSelect, zone, sido, regionLabel, twoYear, officialManwon, onRetry,
}: Props) {
  const uid = useId();
  const [mode, setMode] = useState<LoanMode>("own");
  const [priceChoice, setPriceChoice] = useState<"min" | "max">("min");
  const [manualPrice, setManualPrice] = useState("");
  const [firstLien, setFirstLien] = useState("");
  const [deposit, setDeposit] = useState("");
  const [income, setIncome] = useState("");
  const [existing, setExisting] = useState("");
  const [rate, setRate] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  const ap = areaPrices.find((a) => a.area_m2 === selected);
  const stage = priceStage(ap, twoYear);
  const price =
    stage.kind === "manual" ? toNumber(manualPrice) ?? 0 : priceChoice === "max" ? stage.max : stage.min;
  const ratePct = toNumber(rate);
  const own = mode === "own";
  const r = price > 0
    ? secondLienLimit({
        mode, price, zone, sido,
        firstLien: toNumber(firstLien), deposit: toNumber(deposit),
        income: toNumber(income), existingMonthly: toNumber(existing), ratePct,
      })
    : null;
  const lien = own ? toNumber(firstLien) ?? 0 : 0;
  const dep = toNumber(deposit) ?? 0;
  const ruleText = ruleTextOf(mode, zone, regionLabel);
  const metro = isMetroRegion(metroSidoOf(sido));
  const capApplies = livingFundCapApplies(zone, sido);
  const used = r ? Math.max(0, r.regionLimit - r.afterLiens) : 0;
  const barTotal = r ? used + r.available : 0;
  const basisText = own
    ? `생활안정자금 기준 · 1주택자 · 수도권·규제지역은 최대 1억(금융위 2025-06-28) · 은행 기준 · ${LOAN_RULES_BASIS} 규정 · 입력값은 저장되지 않아요`
    : `무주택 구입 기준 · 은행 기준 · ${LOAN_RULES_BASIS} 규정 · 입력값은 저장되지 않아요`;

  return (
    <Card className="p-4 space-y-3 border-2 border-blue-700" aria-labelledby="consumer-q4" data-testid="consumer-loan">
      <h2 id="consumer-q4" className="text-sm font-bold text-blue-700 tracking-wide">
        4 · 내 돈으로 가능한가 <span className="text-xs font-normal text-gray-500">(참고 계산)</span>
      </h2>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="계산 기준 고르기">
        <Chip on={own} onClick={() => setMode("own")}>이미 가진 집으로</Chip>
        <Chip on={!own} onClick={() => setMode("buy")}>이 집을 사려고</Chip>
      </div>
      {/* 계산 전제(1주택자·2주택 금지 등)는 늘 보인다 — 결과가 보이는 동안 그 전제가 숨으면 안 된다(맹점🟠3) */}
      <p className="text-xs text-gray-500" data-testid="consumer-loan-basis">{basisText}</p>
      {own && (metro || zone !== "normal") && (
        <p className="text-xs text-gray-500">수도권·규제지역 2주택 이상은 취급 금지</p>
      )}
      {areaPrices.some(hasRange) && (
        <AreaChips areaPrices={areaPrices} selected={selected} onSelect={onSelect} label="계산할 면적" />
      )}
      {stage.kind === "manual" ? (
        <div data-testid="consumer-loan-manual">
          <Field
            id={`${uid}-price`}
            label="집값 (최근 2년 거래 기록이 없어 직접 입력)"
            value={manualPrice}
            onChange={setManualPrice}
            unit="만원"
            placeholder="예: 30000"
          />
          {officialManwon != null && officialManwon > 0 && (
            <p className="mt-1 text-xs text-gray-500">공시가격 {formatKoreanPrice(officialManwon)} · 시세보다 낮을 수 있어요</p>
          )}
        </div>
      ) : (
        <div>
          <span className="block text-xs text-gray-500 mb-1">
            집값으로 볼 금액 ({stage.kind === "2y" ? "최근 2년" : "최근 6개월"} 거래 범위에서 고르기)
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="집값 고르기">
            {(stage.min === stage.max ? (["min"] as const) : (["min", "max"] as const)).map((k) => (
              <Chip key={k} on={priceChoice === k || stage.min === stage.max} onClick={() => setPriceChoice(k)}>
                {k === "min" ? `보수적 ${formatKoreanPrice(stage.min)}` : formatKoreanPrice(stage.max)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {onRetry && <LoadRetry onRetry={onRetry} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
        {own && (
          <div>
            <Field id={`${uid}-first`} label="이미 있는 담보대출(선순위)" value={firstLien} onChange={setFirstLien} unit="만원" placeholder="0" />
            <p className="mt-1 text-xs text-gray-500">선순위 대출의 월 상환액은 아래 &lsquo;기존 대출 월 상환&rsquo;에 넣어 주세요</p>
          </div>
        )}
        <Field id={`${uid}-dep`} label="임차보증금 (세입자가 있으면)" value={deposit} onChange={setDeposit} unit="만원" placeholder="0" />
        <Field id={`${uid}-inc`} label="연소득 (선택 · 넣으면 소득 기준도 계산)" value={income} onChange={setIncome} unit="만원" placeholder="예: 4800" />
        <Field id={`${uid}-ext`} label="기존 대출 월 상환 (선택)" value={existing} onChange={setExisting} unit="만원" placeholder="0" />
        <Field id={`${uid}-rate`} label="금리 (선택 · 넣으면 월 상환액)" value={rate} onChange={setRate} unit="연 %" placeholder="예: 4.0" />
      </div>
      <div className="rounded-lg bg-blue-50 p-3 space-y-1.5" data-testid="consumer-loan-result">
        {r == null ? (
          <p className="text-xs text-gray-600">집값을 넣으면 계산해요</p>
        ) : (
          <>
            <Row label={`지역 규칙 · ${ruleText}${!own && metro ? " · 수도권 최대 6억" : ""}`} value={formatKoreanPrice(r.regionLimit)} />
            {lien > 0 && <Row label="− 선순위 대출" value={formatKoreanPrice(lien)} />}
            {dep > 0 && <Row label="− 임차보증금" value={formatKoreanPrice(dep)} />}
            {r.livingFundCap != null && <Row label="생활안정자금 상한 · 수도권·규제지역" value={`최대 ${formatKoreanPrice(r.livingFundCap)}`} />}
            {r.available > 0 ? (
              <Row
                label={own ? "추가로 가능한 담보대출(담보 기준)" : "구입 담보대출 한도(담보 기준)"}
                value={`약 ${formatKoreanPrice(r.available)}`}
                strong={r.incomeLimit == null}
                tail={r.incomeLimit == null ? "(소득 확인 전)" : undefined}
              />
            ) : (
              <p className="text-sm font-bold">지금은 담보 여력이 없어요</p>
            )}
            {own && !capApplies && <p className="text-xs text-gray-600">지방 주택은 1억 상한 없이 은행마다 달라요</p>}
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
                  <i className="bg-blue-700" style={{ width: `${(r.available / barTotal) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>{own ? "선순위·보증금" : "보증금"} {money(used)}</span>
                  <span>{own ? "추가 가능" : "대출 가능"} {money(r.available)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* 금감원·은행연합회 안내 문단만 접어 둔다(기본 닫힘) — 같은 글이 단지마다 반복되므로 열었을 때만 그린다(결정 24) */}
      <button
        type="button"
        aria-expanded={notesOpen}
        onClick={() => setNotesOpen((v) => !v)}
        className="text-xs text-blue-700 underline"
        data-testid="consumer-loan-notes-toggle"
      >
        {notesOpen ? "금융사 조건 비교 안내 접기" : "금융사 조건 비교 안내 보기"}
      </button>
      {notesOpen && (
        <div className="space-y-1" data-testid="consumer-loan-notes">
          <p className="text-xs text-gray-500">
            실제 한도는 소득·신용·기존 대출로 달라져요. 금융사별 조건은{" "}
            <a href="https://finlife.fss.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">금융감독원 금융상품 비교공시</a>
            {" · "}
            <a href="https://portal.kfb.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">은행연합회 소비자포털</a>
            에서 비교해 보세요.
          </p>
        </div>
      )}
    </Card>
  );
}
