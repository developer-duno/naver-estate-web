import type { ChecklistType } from "@/lib/broker/checklists";
import { CIV161 } from "@/lib/broker/law-urls";
import {
  computeDeadline,
  deadlineStatus,
  deadlineTitle,
  formatFull,
  formatShort,
  kindLabel,
  statusText,
} from "@/lib/broker/deadlines";

/**
 * 거래 장(DealChecklist, 중개사용)의 신고 기한 상자(세션 519) — 계약일로 그때그때 계산한다(저장하지 않는다).
 * today 가 없으면(마운트 전) 남은 날수 없이 날짜만 그린다. 계약일 형식이 틀리면 아무것도 그리지 않는다.
 * reported = 그 유형의 신고 항목을 체크한 거래 → 상태 대신 「신고 항목 체크함 ✓」.
 */
export default function DeadlineBox({
  type,
  contractDate,
  reported,
  today,
}: {
  type: ChecklistType;
  contractDate: string;
  reported: boolean;
  today: string | null;
}) {
  const deadline = computeDeadline(contractDate);
  if (!deadline) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-brand-bg px-3.5 py-3 sm:max-w-xl">
      <p className="text-xs text-brand-muted">{deadlineTitle(type)}</p>
      {reported ? (
        <>
          <p className="text-base font-black text-brand-muted">신고 항목 체크함 ✓</p>
          <p className="text-[13px] text-brand-muted">기한은 {formatFull(deadline.base)}였습니다.</p>
        </>
      ) : (
        <>
          <p className="text-base font-black text-brand-navy">
            {formatFull(deadline.base)}까지
            {today && (
              <span className="ml-1.5 text-brand-orange-text">{statusText(deadlineStatus(deadline, today))}</span>
            )}
          </p>
          <p className="text-[13px] leading-relaxed text-brand-muted">
            계약일 다음 날부터 세어 30일째입니다.
            {type === "sale" && " 중개한 거래는 개업공인중개사가 신고합니다."}
            {deadline.extended && (
              <>
                {` 그날이 ${kindLabel(deadline)}이라 법으로는 ${formatShort(deadline.extended)}까지 늘어납니다. `}
                <a href={CIV161} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-navy">
                  민법 제161조 ↗
                </a>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
