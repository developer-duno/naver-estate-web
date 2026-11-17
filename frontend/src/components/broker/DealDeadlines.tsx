"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHECKLISTS } from "@/lib/broker/checklists";
import { DEALS_KEY, readDeals, setActive, writeDeals } from "@/lib/broker/deals-storage";
import {
  deadlineRows,
  formatMonthDay,
  formatShort,
  statusText,
  todayKST,
  type DeadlineRow,
} from "@/lib/broker/deadlines";

const cardClass = "rounded-xl bg-white p-[18px] sm:rounded-2xl sm:p-6";
const cardTitleClass = "text-lg font-black tracking-tight text-brand-navy sm:text-xl";

/** 오늘 날짜를 읽을 시각 — effect 안에서만 부른다(렌더 중에 시각을 읽지 않는다) */
function nowMs(): number {
  return Date.now();
}

/** 줄 오른쪽 글자 — 신고 체크함 / 기한 지남 · 기본 기한 / 남은 기한 · 남은 날수 */
function whenText(r: DeadlineRow): string {
  if (r.reported) return "신고 체크함 ✓";
  if (r.status.kind === "past") return `기한 지남 · ${formatShort(r.deadline.base)}`;
  const date = r.status.kind === "extended-left" && r.deadline.extended ? r.deadline.extended : r.deadline.base;
  return `${formatShort(date)} · ${statusText(r.status)}`;
}

/**
 * 「중개 실무」 첫 화면의 「내 거래 신고 기한」 카드(세션 519).
 * 이 기기에 저장한 중개사용 거래 중 계약일을 넣은 것만, 신고 기한(계약일 + 30일)을 한 줄씩 보인다.
 * 서버 HTML·마운트 전에는 빈 안내만 그리고, 마운트 뒤 저장소와 오늘(한국 시각)을 읽어 채운다.
 * 줄을 누르면 그 거래를 고른 상태로 저장하고 그 거래 장으로 간다. 다른 탭이 바꾸면 다시 읽는다.
 */
export default function DealDeadlines() {
  const [rows, setRows] = useState<DeadlineRow[]>([]);

  useEffect(() => {
    const load = () => {
      const r = readDeals();
      // 저장이 깨져 있으면 빈 안내(거래 장이 읽을 때 한 번 알린다)
      setRows(r.ok ? deadlineRows(r.state, todayKST(new Date(nowMs()))) : []);
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEALS_KEY || e.key === null) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** 그 거래를 고른 상태로 저장 — 이동은 Link 가 한다 */
  const pick = (r: DeadlineRow) => {
    const s = readDeals();
    if (s.ok) writeDeals(setActive(s.state, r.type, r.id));
  };

  return (
    <section aria-labelledby="broker-deadlines" className={cardClass}>
      <h2 id="broker-deadlines" className={cardTitleClass}>
        내 거래 신고 기한
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-brand-muted leading-relaxed">
          체크 목록에서 계약일을 넣으면 여기에 신고 기한이 보입니다.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col divide-y divide-brand-line-soft">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/broker/${r.type}`}
                  onClick={() => pick(r)}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm hover:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  <span className="font-bold text-brand-navy">
                    {`${CHECKLISTS[r.type].name} 거래 ${r.no} · 계약 ${formatMonthDay(r.contractDate)}`}
                  </span>
                  <span
                    className={
                      r.reported
                        ? "font-bold text-brand-muted"
                        : r.status.kind === "past"
                          ? "font-black tabular-nums text-brand-orange-text"
                          : "font-black tabular-nums text-brand-navy"
                    }
                  >
                    {whenText(r)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-brand-muted leading-relaxed">
            이 기기에 저장한 거래 중 계약일을 넣은 것만 보입니다. 줄을 누르면 그 거래 장으로 갑니다.
          </p>
        </>
      )}
    </section>
  );
}
