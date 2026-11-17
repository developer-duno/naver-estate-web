"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CHECKLISTS, type ChecklistType } from "@/lib/broker/checklists";
import { formatDateDot } from "@/lib/broker/upcoming-dates";
import { REPORT_ITEM, todayKST } from "@/lib/broker/deadlines";
import DeadlineBox from "./DeadlineBox";
import {
  DEALS_KEY,
  MAX_DEALS,
  activeDeal,
  addDeal,
  clearChecks,
  dealsOf,
  emptyState,
  limitedDealCount,
  readDeals,
  removeDeal,
  restoreChecks,
  restoreDeal,
  setActive,
  setContractDate,
  toggleCheck,
  writeDeals,
  type DealsState,
  type RemovedDeal,
} from "@/lib/broker/deals-storage";

/** 되돌리기 알림이 떠 있는 시간 */
export const UNDO_MS = 10_000;

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";
const cardTitleClass = "text-lg font-black tracking-tight text-brand-navy sm:text-xl";
const btnClass =
  "inline-flex min-h-11 items-center rounded-lg border border-brand-line px-3 text-sm font-bold text-brand-navy hover:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 되돌리기 알림 한 자리 — 비우기(checks = 화면에 보이던 체크(알림 숫자) · unknown = 이 판이 모르는 항목 체크) 또는
 * 거래 지우기(세션 519 — 지운 거래를 그대로 들고 있다). 나중 것이 앞 것을 바꾼다.
 */
type Undo =
  | { kind: "checks"; dealId: string; no: number; checks: string[]; unknown: string[] }
  | { kind: "deal"; removed: RemovedDeal };

/** 새 거래의 만든 시각 — 이벤트 처리기에서만 부른다(렌더 중에 시각을 읽지 않는다) */
function nowMs(): number {
  return Date.now();
}

/**
 * 거래 유형별 체크 목록의 단계 카드 + 「내 거래」 줄(세션 513 PR 2b).
 * 서버 HTML 은 체크 상자가 전부 꺼진 상태로 그리고(글자는 첫 HTML 에 그대로), 마운트 뒤 이 기기 저장소를 읽어 채운다.
 * 저장 = lib/broker/deals-storage.ts(이 기기 이 브라우저에만).
 * single(세션 514 — 세입자·집주인용 /checklist/[type]): 거래가 보통 하나라 「거래 고르기·새 거래·계약일」을 그리지 않고
 * 진행 막대·「비우기」(10초 되돌리기)·저장 안내만 둔다. 저장 모양은 같다(처음 체크하면 그 유형 「거래 1」이 생긴다).
 */
export default function DealChecklist({ type, single = false }: { type: ChecklistType; single?: boolean }) {
  const list = CHECKLISTS[type];
  const total = list.stages.reduce((n, s) => n + s.items.length, 0);
  const uid = useId();

  const [state, setState] = useState<DealsState>(emptyState);
  const stateRef = useRef<DealsState>(state);
  const [saveFailed, setSaveFailed] = useState(false);
  const [corrupt, setCorrupt] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  /** 한국 시각의 오늘 — 마운트 뒤에 넣는다(그 전엔 신고 기한의 남은 날수를 그리지 않는다) */
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    // localStorage 는 서버에서 못 읽는다 — 마운트 뒤 1회 읽고, 다른 탭이 같은 키를 바꾸면 다시 읽는다(오늘 날짜도 함께)
    const load = () => {
      setToday(todayKST(new Date(nowMs())));
      const r = readDeals();
      stateRef.current = r.state;
      setState(r.state);
      if (!r.ok) setCorrupt(true);
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEALS_KEY || e.key === null) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  /** 새 상태를 화면에 반영하고 저장한다 — 저장이 막혀도 화면 상태는 그대로 진행 */
  const commit = useCallback((next: DealsState) => {
    stateRef.current = next;
    setState(next);
    setSaveFailed(!writeDeals(next));
    setCorrupt(false);
  }, []);

  const deals = dealsOf(state, type);
  const current = activeDeal(state, type);
  const checked = new Set(current?.checks ?? []);
  const full = limitedDealCount(state) >= MAX_DEALS;

  const onNewDeal = () => {
    // 지우기 알림이 떠 있으면 닫는다 — 새 거래로 상한이 차면 되살릴 수 없어서
    if (undo?.kind === "deal") setUndo(null);
    const r = addDeal(stateRef.current, type, nowMs());
    if (r) commit(r.state);
  };

  const onDeleteDeal = () => {
    const deal = activeDeal(stateRef.current, type);
    if (!deal) return;
    const r = removeDeal(stateRef.current, deal.id);
    if (!r) return;
    commit(r.state);
    setUndo({ kind: "deal", removed: r.removed });
  };

  const onToggle = (itemId: string) => {
    let s = stateRef.current;
    let deal = activeDeal(s, type);
    if (!deal) {
      // 묶음이 하나도 없을 때 처음 체크하면 「거래 1」을 만든다
      const r = addDeal(s, type, nowMs());
      if (!r) return;
      s = r.state;
      deal = r.deal;
    }
    commit(toggleCheck(s, deal.id, itemId));
  };

  const onClear = () => {
    const deal = activeDeal(stateRef.current, type);
    if (!deal || deal.checks.length === 0) return;
    const r = clearChecks(stateRef.current, deal.id);
    commit(r.state);
    setUndo({ kind: "checks", dealId: deal.id, no: deal.no, checks: r.removed, unknown: r.removedUnknown });
  };

  const onUndo = () => {
    if (!undo) return;
    if (undo.kind === "checks") {
      commit(restoreChecks(stateRef.current, undo.dealId, undo.checks, undo.unknown));
    } else {
      // 그 사이 상한이 찼거나 같은 거래가 이미 있으면 되살리지 않는다(상태 그대로)
      const next = restoreDeal(stateRef.current, undo.removed);
      if (next) commit(next);
    }
    setUndo(null);
  };

  const onDate = (value: string) => {
    if (!current) return;
    const next = setContractDate(stateRef.current, current.id, value || undefined);
    if (next) commit(next);
  };

  // 단계마다 이어지는 번호(1~N) — 각 단계 <ol> 의 start
  const starts: number[] = [];
  list.stages.reduce((n, s) => {
    starts.push(n);
    return n + s.items.length;
  }, 1);

  const doneCount = checked.size;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const reportItem = REPORT_ITEM[type];

  const clearButton = (
    <button
      type="button"
      onClick={onClear}
      disabled={!current || doneCount === 0}
      className={btnClass}
    >
      비우기
    </button>
  );

  return (
    <>
      <section aria-labelledby={`${uid}-deals`} className={`${cardClass} mb-3 sm:mb-4`}>
        <p id={`${uid}-deals`} className={single ? "sr-only" : "text-base font-black text-brand-navy"}>
          {single ? "확인한 항목" : "내 거래"}
        </p>
        <div className={single ? "flex flex-col gap-3" : "mt-3 flex flex-col gap-3"}>
          {single ? null : deals.length > 0 ? (
            <div>
              <label htmlFor={`${uid}-select`} className="sr-only">
                거래 고르기
              </label>
              <select
                id={`${uid}-select`}
                value={current?.id ?? ""}
                onChange={(e) => commit(setActive(stateRef.current, type, e.target.value))}
                className="min-h-11 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-bold text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy sm:w-auto sm:min-w-72"
              >
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`거래 ${d.no} · ${list.name}${d.contractDate ? ` · 계약일 ${formatDateDot(d.contractDate)}` : ""}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-brand-muted">아직 거래가 없습니다. 항목을 체크하면 「거래 1」이 생깁니다.</p>
          )}

          {!single && (
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={onNewDeal}
                disabled={full}
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-navy px-3 text-sm font-bold text-white hover:bg-brand-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange disabled:cursor-not-allowed disabled:opacity-50"
              >
                + 새 거래
              </button>
              <div className="flex flex-col">
                <label htmlFor={`${uid}-date`} className="text-xs text-brand-muted">
                  계약일(선택)
                </label>
                <input
                  id={`${uid}-date`}
                  type="date"
                  value={current?.contractDate ?? ""}
                  onChange={(e) => onDate(e.target.value)}
                  disabled={!current}
                  className="min-h-11 rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:opacity-50"
                />
              </div>
              {clearButton}
              <button type="button" onClick={onDeleteDeal} disabled={!current} className={btnClass}>
                거래 지우기
              </button>
            </div>
          )}
          {full && !single && (
            <p className="text-xs text-brand-muted">거래는 20개까지 저장됩니다. 끝난 거래는 지워 주세요.</p>
          )}
          {/* 신고 기한(세션 519) — 중개사 장에서 신고 항목이 있는 유형이고 계약일이 있을 때만 */}
          {!single && reportItem && current?.contractDate && (
            <DeadlineBox type={type} contractDate={current.contractDate} reported={checked.has(reportItem)} today={today} />
          )}

          <div>
            <div
              role="progressbar"
              aria-label="확인한 항목"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={doneCount}
              className="h-1.5 overflow-hidden rounded-full bg-brand-line-soft"
            >
              <div className="h-full bg-brand-orange" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-brand-muted">
              <span className="font-bold text-brand-navy">
                {total}개 중 {doneCount}개 확인
              </span>{" "}
              · 이 기기 이 브라우저에만 저장됩니다. 다른 기기로 옮겨지지 않습니다.
            </p>
            {single && <div className="mt-2">{clearButton}</div>}
          </div>

          {saveFailed && (
            <p className="rounded-lg bg-brand-orange-soft px-3 py-2 text-sm text-brand-orange-text">
              이 브라우저는 저장을 막아 두어, 창을 닫으면 체크 표시가 사라집니다.
            </p>
          )}
          {corrupt && (
            <p className="rounded-lg bg-brand-orange-soft px-3 py-2 text-sm text-brand-orange-text">
              저장된 체크를 읽지 못해 새로 시작합니다.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:gap-4">
        {list.stages.map((stage, si) => (
          <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className={cardClass}>
            <h2 id={`stage-${stage.id}`} className={cardTitleClass}>
              {stage.title}
            </h2>
            <ol
              start={starts[si]}
              className="mt-3 flex list-decimal flex-col divide-y divide-brand-line-soft pl-6 marker:font-bold marker:text-brand-orange-text"
            >
              {stage.items.map((item) => {
                const on = checked.has(item.id);
                const boxId = `${uid}-${item.id}`;
                return (
                  <li key={item.id} id={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <input
                        id={boxId}
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(item.id)}
                        className="mt-0.5 size-5 shrink-0 accent-brand-orange-text"
                      />
                      <h3 className="text-base font-bold leading-snug">
                        <label
                          htmlFor={boxId}
                          className={on ? "text-brand-muted line-through" : "text-brand-navy"}
                        >
                          {item.title}
                        </label>
                      </h3>
                    </div>
                    {item.detail && <p className="mt-1 text-sm text-brand-muted leading-relaxed">{item.detail}</p>}
                    {item.links && item.links.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {item.links.map((l) =>
                          l.href.startsWith("/") ? (
                            <Link
                              key={l.href}
                              href={l.href}
                              className="text-brand-orange-text underline hover:text-brand-navy"
                            >
                              {l.label} →
                            </Link>
                          ) : (
                            <a
                              key={l.href}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-orange-text underline hover:text-brand-navy"
                            >
                              {l.label} ↗
                            </a>
                          ),
                        )}
                      </p>
                    )}
                    {/* 근거 조문이 없는 항목(매수인 대출 계산 링크 · 세션 516)은 「근거」 줄을 그리지 않는다 */}
                    {item.laws.length > 0 && (
                      <p className="mt-1 text-xs text-brand-muted leading-relaxed">
                        <span className="font-bold">근거</span>{" "}
                        {item.laws.map((law, li) => (
                          <span key={law.label}>
                            {li > 0 && " · "}
                            <a
                              href={law.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-brand-navy"
                            >
                              {law.label} ↗
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {/* 알림 영역은 늘 두고(빈 상태) 내용만 바꾼다 — 화면 읽기 프로그램이 새 문장을 읽게 */}
      <div role="status" aria-live="polite">
        {undo && (
          <div data-floating-bar className="fixed inset-x-0 bottom-0 z-50 px-4 pb-3">
            <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-brand-navy px-4 py-1.5 text-sm text-white shadow-lg">
              <span>
                {undo.kind === "deal"
                  ? `거래 ${undo.removed.deal.no}(${list.name})를 지웠습니다.`
                  : single
                    ? `체크 ${undo.checks.length}개를 지웠습니다.`
                    : `거래 ${undo.no}의 체크 ${undo.checks.length}개를 지웠습니다.`}
              </span>
              <button
                type="button"
                onClick={onUndo}
                className="min-h-10 shrink-0 rounded px-2 font-bold text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                되돌리기
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
