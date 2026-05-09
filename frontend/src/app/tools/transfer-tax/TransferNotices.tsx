"use client";

import type { TransferNoticeKey } from "@/lib/transfer-tax";

type Tone = "info" | "warn" | "danger";

const NOTICE_MESSAGES: Record<TransferNoticeKey, { title: string; body: string; tone: Tone }> = {
  "disclaimer": {
    tone: "info",
    title: "면책 안내",
    body:
      "본 계산기는 표준 기준 참고치입니다. 4구 보완·상생임대주택·일시적 2주택·재개발/재건축 입주권 등 특례는 미반영. 정확한 세액은 세무사 상담 권장.",
  },
  "out-of-scope": {
    tone: "warn",
    title: "적용 범위 안내",
    body:
      "상가·토지·해외부동산·증여·상속·분양권·입주권은 본 계산기 범위 밖입니다. 별도 세무 상담 필요.",
  },
  "loss-no-tax": {
    tone: "info",
    title: "양도차손 발생",
    body:
      "산출세액 0원. 동일 연도 다른 부동산 양도소득과 통산 가능 (소득세법 §102).",
  },
  "unregistered-70": {
    tone: "danger",
    title: "⚠ 미등기 양도 형사책임",
    body:
      "미등기 거래는 부동산실명법 위반(5년 이하 징역 또는 2억원 이하 벌금)입니다. 본 계산기는 이미 적발된 미등기 양도분의 세액 참고용일 뿐, 미등기 거래를 권장·교사하지 않습니다. 70% 단독 적용, 장기보유공제·기본공제 모두 배제.",
  },
  "single-house-exempt-met": {
    tone: "info",
    title: "1세대1주택 비과세 충족",
    body:
      "12억 이하 양도 + 보유 2년+ + 거주 2년 (조정지역 취득시) 충족. 산출세액 0원.",
  },
  "single-house-prorate": {
    tone: "info",
    title: "12억 초과 안분 적용",
    body:
      "양도가 12억 초과분에 한해 과세. 안분 산식: 양도차익 × (양도가 - 12억) / 양도가. 표2 보유+거주 합산 공제 (최대 80%) 적용.",
  },
  "single-house-fail-hold": {
    tone: "warn",
    title: "보유 2년 미충족 — 비과세 불가",
    body:
      "1세대1주택 비과세는 보유 2년 이상 필수. 현재 보유연수 미달로 일반 누진 과세 적용.",
  },
  "single-house-fail-live": {
    tone: "warn",
    title: "거주 2년 미충족 — 비과세 불가",
    body:
      "조정지역 취득 1주택은 거주 2년 이상 필수. 거주연수 미달로 일반 누진 과세 적용. 상생임대주택 특례 가능성 별도 확인.",
  },
  "short-term-70": {
    tone: "warn",
    title: "단기보유 70% 단일세율",
    body:
      "보유 1년 미만은 70% 단독 과세 (소득세법 §104). 장기보유공제 미적용.",
  },
  "short-term-60": {
    tone: "warn",
    title: "단기보유 60% 단일세율",
    body:
      "보유 1년 이상 2년 미만은 60% 단독 과세. 장기보유공제 미적용.",
  },
  "multi-heavy-suspended": {
    tone: "info",
    title: "한시배제 적용 (다주택 중과 0)",
    body:
      "다주택 중과 한시배제 2026-05-09 종료 확정. 이 날짜 이하 양도분은 중과 배제 + 표1 장특공 적용 가능. 2026-05-10 이후 양도분은 +20%/+30%p 중과 부과.",
  },
  "multi-heavy-applied": {
    tone: "danger",
    title: "⚠ 다주택 중과 적용",
    body:
      "한시배제 종료 후 양도. 2주택 +20%p / 3주택 이상 +30%p 가산. 장기보유공제 모두 배제 (소득세법 §95② 단서 + §104⑦).",
  },
  "local-income-tax": {
    tone: "info",
    title: "지방소득세 별도 안내",
    body:
      "본세에 지방소득세 약 10% 별도 부과 (본세 × 0.1). 본 계산기는 본세만 표시.",
  },
  "four-district-grace": {
    tone: "info",
    title: "강남4구 보완 안내",
    body:
      "강남·서초·송파·용산 4개구는 매매계약일로부터 4개월 이내 양도 시 중과 배제 (2026-09-09까지). 본 계산기는 전국 일반 기준이므로 4구 보완은 별도 검토 필요.",
  },
  "relief-rental-house": {
    tone: "info",
    title: "상생임대주택 특례 안내",
    body:
      "상생임대차계약(2021.12.20~2026.12.31 체결) 체결한 임대주택은 거주 2년 요건 면제 (시행령 §155의3). 본 계산기는 일반 기준이므로 별도 확인 필요.",
  },
};

const TONE_STYLES: Record<Tone, { container: string; title: string; body: string }> = {
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
  danger: {
    container: "rounded-md bg-red-50 border border-red-200 px-3 py-2",
    title: "text-xs font-semibold text-red-800",
    body: "text-xs text-red-700",
  },
};

const TONE_ORDER: Record<Tone, number> = { danger: 0, warn: 1, info: 2 };

export default function TransferNotices({ notes }: { notes: TransferNoticeKey[] }) {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort(
    (a, b) => TONE_ORDER[NOTICE_MESSAGES[a].tone] - TONE_ORDER[NOTICE_MESSAGES[b].tone]
  );
  return (
    <div className="space-y-2">
      {sorted.map((key) => {
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
