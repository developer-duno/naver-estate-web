"use client";

import type { PropertyTaxNoticeKey } from "@/lib/property-tax-types";

type Tone = "info" | "warn" | "danger";

const NOTICE_MESSAGES: Record<PropertyTaxNoticeKey, { title: string; body: string; tone: Tone }> = {
  disclaimer: {
    tone: "info",
    title: "면책 안내",
    body:
      "본 계산기는 표준 기준 참고치입니다. 공동명의·합산배제·임대등록·종교/사원용·법인 누진은 미반영. 정확한 세액은 세무사 상담 권장.",
  },
  "single-house-special-rate": {
    tone: "info",
    title: "1세대1주택 특례 세율 적용",
    body:
      "지방세법 §111의2에 따라 1세대1주택자는 공시가 9억원 이하 구간 0.05/0.1/0.2/0.35% 특례 세율 적용 (일반 0.1/0.15/0.25/0.4% 보다 낮음).",
  },
  "single-house-deduction-12e": {
    tone: "info",
    title: "1세대1주택 종부세 공제 12억",
    body:
      "종부세법 §8에 따라 1세대1주택자는 공시가 합계 12억원까지 종부세 비과세. 공정시장가액비율 60% 적용 후 누진세율로 산출.",
  },
  "general-deduction-9e": {
    tone: "info",
    title: "일반 종부세 공제 9억",
    body:
      "1세대1주택자 외 일반(2주택 이상 포함)은 공시가 합계 9억원 공제. 공정시장가액비율 60% 적용 후 누진세율로 산출.",
  },
  "below-comprehensive-threshold": {
    tone: "info",
    title: "종부세 과세표준 0 — 납부 의무 없음",
    body:
      "공시가격이 종부세 공제(12억 또는 9억) 미만이라 과세표준 0원. 종부세·농특세 모두 0원이며 재산세만 부담.",
  },
  "fair-market-ratio-60": {
    tone: "info",
    title: "공정시장가액비율 60%",
    body:
      "재산세·종부세 모두 공시가격 × 공정시장가액비율(현재 60%)로 과세표준 산출. 1세대1주택 일부 구간은 43~45%로 추가 인하 (본 계산기 미반영).",
  },
  "multi-heavy-25e": {
    tone: "warn",
    title: "⚠ 3주택 이상 + 25억 초과 = 중과 누진 진입",
    body:
      "종부세법 §9② 단서 — 3주택 이상 보유자가 종부세 과세표준 25억원(공시 약 24.5억+9억 공제) 초과 시 중과 누진세율(2.0~5.0%) 적용.",
  },
  "age-deduction-eligible": {
    tone: "info",
    title: "연령 세액공제 가능",
    body:
      "60세 이상 1세대1주택자는 종부세액에서 연령 세액공제 (60+ 20% / 65+ 30% / 70+ 40%) 적용. 보유 공제와 합산 한도 80%.",
  },
  "hold-deduction-eligible": {
    tone: "info",
    title: "보유 세액공제 가능",
    body:
      "1세대1주택자가 5년 이상 보유 시 종부세액에서 보유 세액공제 (5+ 20% / 10+ 40% / 15+ 50%) 적용. 연령 공제와 합산 한도 80%.",
  },
  "rural-tax-20": {
    tone: "info",
    title: "농어촌특별세 20% 별도",
    body:
      "농특세법 §5에 따라 종합부동산세액의 20%가 농어촌특별세로 추가 부과. 재산세에는 부과되지 않음.",
  },
  "tax-burden-cap-150": {
    tone: "warn",
    title: "⚠ 세부담 상한 150% 미반영",
    body:
      "지방세법 §122 — 전년 대비 보유세 150% 초과분은 자동 캡 적용. 본 계산기는 단순 산출세액만 표시하므로 실제 납부세액은 더 낮을 수 있음. 정확한 캡 산식은 세무사 상담 권장.",
  },
  "consult-experts": {
    tone: "warn",
    title: "세무사 상담 권장",
    body:
      "공동명의(지분별 별도 합산)·합산배제 신청 주택(임대등록·종교용·사원용·주택신축용 등)·법인 누진세율 적용 케이스는 본 계산기 범위 밖입니다. 세무사·국세청 상담 필요.",
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

export default function PropertyTaxNotices({ notes }: { notes: PropertyTaxNoticeKey[] }) {
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
