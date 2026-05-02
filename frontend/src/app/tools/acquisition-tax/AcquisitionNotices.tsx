"use client";

import type { AcquisitionNoticeKey } from "@/lib/acquisition-tax";

type AcquisitionNoticeTone = "info" | "warn";

const NOTICE_MESSAGES: Record<AcquisitionNoticeKey, { title: string; body: string; tone: AcquisitionNoticeTone }> = {
  "disclaimer": {
    tone: "info",
    title: "면책 안내",
    body: "취득세 과세표준 = 실거래가 (지방세법 제10조의3). 정확한 세액은 시·군·구청 또는 세무사 상담 권장.",
  },
  "multi-house-rural": {
    tone: "info",
    title: "다주택 부속세",
    body: "다주택 농특세는 8% 시 0.6%, 12% 시 1.0%로 표준 시(0.2%)보다 높습니다 (면적 무관).",
  },
  "first-time-base-only": {
    tone: "info",
    title: "생애최초 감면 안내",
    body: "200만원 감면은 취득세 본세에만 적용. 농특세·교육세는 표준세율 그대로 부과됩니다.",
  },
  "area-85-exempt": {
    tone: "info",
    title: "85m² 비과세",
    body: "전용 85m² 이하 1주택은 농특세 비과세. 다주택 중과 시는 면적 무관 부과.",
  },
  "first-time-rejected": {
    tone: "warn",
    title: "생애최초 적용 불가",
    body: "12억 초과 매물은 생애최초 감면 대상이 아닙니다. 표준세율로 계산했습니다.",
  },
};

const TONE_STYLES: Record<AcquisitionNoticeTone, { container: string; title: string; body: string }> = {
  info: {
    container: "rounded-md bg-gray-50 border border-gray-200 px-3 py-2",
    title: "text-xs font-semibold text-gray-800",
    body: "text-xs text-gray-700",
  },
  warn: {
    container: "rounded-md bg-amber-50 border border-amber-200 px-3 py-2",
    title: "text-xs font-semibold text-amber-800",
    body: "text-xs text-amber-700",
  },
};

export default function AcquisitionNotices({ notes }: { notes: AcquisitionNoticeKey[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-2">
      {notes.map((key) => {
        const msg = NOTICE_MESSAGES[key];
        const styles = TONE_STYLES[msg.tone];
        return (
          <div key={key} className={styles.container} role="note">
            <p className={styles.title}>{msg.title}</p>
            <p className={styles.body}>{msg.body}</p>
          </div>
        );
      })}
    </div>
  );
}
