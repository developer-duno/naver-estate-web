"use client";

import type { MbPresaleSchedule } from "@/types";
import { formatScheduleDate, formatDateRange, formatDday, formatMoveInYm } from "@/lib/mb-presale-format";

/** 청약 일정 타임라인 — 차수(house_manage_no)별 12종 일정.
 * 단지가 차수 여러 개면(984행/859단지) 각 차수를 카드로 분리. */
interface Props {
  schedules: MbPresaleSchedule[];
}

/** 단일 일정 행 (라벨 + 날짜/기간 + 선택적 D-day 뱃지) */
function ScheduleRow({
  label,
  value,
  dday,
}: {
  label: string;
  value: string;
  dday?: string;
}) {
  if (value === "-") return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 flex-none w-28">{label}</span>
      <span className="text-sm text-gray-800 flex-1 text-right">{value}</span>
      {dday && (
        <span className="ml-2 text-[11px] font-semibold text-blue-600 flex-none w-12 text-right">{dday}</span>
      )}
    </div>
  );
}

function ScheduleCard({ s, multi }: { s: MbPresaleSchedule; multi: boolean }) {
  // 임박 D-day = 특별공급 접수 시작 기준 (없으면 1순위 접수)
  const ddaySource = s.special_receipt_bgnde ?? s.general_rank1_bgnde;
  const headerDday = ddaySource ? formatDday(ddaySource) : "";
  return (
    <div className="border border-gray-200 rounded-md p-3">
      {(multi || headerDday) && (
        <div className="flex items-center gap-2 mb-2">
          {multi && (
            <span className="text-xs font-semibold text-gray-700">공고 {s.pblanc_no ?? s.house_manage_no}</span>
          )}
          {multi && s.tot_supply != null && (
            <span className="text-[11px] text-gray-500">총 {s.tot_supply.toLocaleString()}세대</span>
          )}
          {headerDday && (
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
              청약 {headerDday}
            </span>
          )}
        </div>
      )}
      <div className="space-y-0">
        <ScheduleRow label="모집공고일" value={formatScheduleDate(s.recruit_date)} dday={formatDday(s.recruit_date)} />
        <ScheduleRow
          label="특별공급 접수"
          value={formatDateRange(s.special_receipt_bgnde, s.special_receipt_endde)}
          dday={s.special_receipt_bgnde ? formatDday(s.special_receipt_bgnde) : undefined}
        />
        <ScheduleRow
          label="1순위 접수"
          value={formatDateRange(s.general_rank1_bgnde, s.general_rank1_endde)}
          dday={s.general_rank1_bgnde ? formatDday(s.general_rank1_bgnde) : undefined}
        />
        <ScheduleRow
          label="2순위 접수"
          value={formatDateRange(s.general_rank2_bgnde, s.general_rank2_endde)}
        />
        <ScheduleRow
          label="당첨자 발표"
          value={formatScheduleDate(s.winner_announce_date)}
          dday={s.winner_announce_date ? formatDday(s.winner_announce_date) : undefined}
        />
        <ScheduleRow label="계약 기간" value={formatDateRange(s.contract_bgnde, s.contract_endde)} />
        <ScheduleRow label="입주예정월" value={formatMoveInYm(s.move_in_ym)} />
      </div>
      {(s.biz_entity || s.constructor_name) && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
          {s.biz_entity && <span>시행 {s.biz_entity}</span>}
          {s.constructor_name && <span>시공 {s.constructor_name}</span>}
        </div>
      )}
      {s.pblanc_url && (
        <a
          href={s.pblanc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-blue-600 hover:underline"
        >
          청약홈 공고 보기 →
        </a>
      )}
    </div>
  );
}

export default function MbScheduleTimeline({ schedules }: Props) {
  if (!schedules || schedules.length === 0) {
    return <p className="text-sm text-gray-400">등록된 청약 일정이 없습니다.</p>;
  }
  const multi = schedules.length > 1;
  return (
    <div className="space-y-3">
      {schedules.map((s) => (
        <ScheduleCard key={s.id} s={s} multi={multi} />
      ))}
    </div>
  );
}
