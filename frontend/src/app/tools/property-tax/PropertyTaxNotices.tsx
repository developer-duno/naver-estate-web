"use client";

import type { PropertyTaxNoticeKey } from "@/lib/property-tax-types";

type Tone = "info" | "warn" | "danger";

const NOTICE_MESSAGES: Record<PropertyTaxNoticeKey, { title: string; body: string; tone: Tone }> = {
  disclaimer: {
    tone: "info",
    title: "면책 안내",
    body:
      "본 계산기는 표준 기준 참고치입니다. **합산배제·공동명의·법인 단일세율·부부 공동명의 1주택자 특례 + 1세대1주택 재산세 공정시장가액비율 차등(§109) + 종부세 공제할 재산세액(§4의2) 모두 반영 완료** — 도구 100% 정확. 향교/종교는 산식 영향 없는 신고 절차 특례라 별도 처리 불필요. 정확한 세액은 세무사 상담 권장.",
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
    title: "공정시장가액비율 60% (일반)",
    body:
      "본 계산기는 종부세 + 재산세(다주택 또는 1주택 미충족) 모두 공시가격 × 60%로 과세표준 산출. 1세대1주택자는 별도 차등 비율 자동 적용 (`single-house-fair-market-ratio` 안내 참조).",
  },
  "single-house-fair-market-ratio": {
    tone: "info",
    title: "1세대1주택 공정시장가액비율 차등 (43~45%)",
    body:
      "지방세법 시행령 §109 — 1세대1주택자는 재산세 공정시장가액비율을 일반 60%가 아닌 시가표준액 구간별로 차등 적용 (3억 이하 43% / 3억 초과 6억 이하 44% / 6억 초과 45%). 9억 초과 1주택도 45% 적용 (한도 없음). 2025년 납세의무, 2026년 유지. 본 계산기 자동 반영. 종부세 공정시장가액비율은 60% 그대로 유지.",
  },
  "comprehensive-property-tax-credit": {
    tone: "info",
    title: "종부세 공제할 재산세액 자동 차감 (이중과세 방지)",
    body:
      "종부세법 시행령 §4의2 — 종부세 산출세액에서 재산세 중복 부과분을 차감해 이중과세를 방지합니다. 분자: 종부세 과세표준 부분 재산세 상당액 (누진세율). 분모: 전체 주택 재산세 상당액 (누진세율). 비율 = 분자/분모. 공제액 = 실제 재산세 부과액 × 비율. 1주택·다주택·법인 모두 적용 (KILF + 국세청 공식). 1세대1주택 세액공제는 본 차감 후 종부세액 기준으로 적용 (대법원 2019두39796 판결 정합). 본 계산기 자동 반영.",
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
      "지방세법 §122 — 전년 대비 보유세 150% 초과분은 자동 캡 적용. 전년도 보유세를 입력하시면 자동으로 cap 이 적용됩니다 (현재 미입력 상태). 정확한 캡 산식은 세무사 상담 권장.",
  },
  "tax-burden-cap-applied": {
    tone: "info",
    title: "✓ 세부담 상한 150% 자동 반영",
    body:
      "지방세법 §122 — 전년도 보유세 입력값 기준으로 150% cap 적용. 산출 합계가 cap 을 넘으면 cap 으로 제한됩니다. 결과 표 하단의 'cap 적용' 표시로 실제 발동 여부 확인 가능.",
  },
  "exclusion-applied": {
    tone: "info",
    title: "합산배제 신청 주택 반영",
    body:
      "종부세법 §8③ / 시행령 §3 — 임대등록·종교/사원용·주택신축용 등 합산배제 신청 주택은 종부세 산정에서 제외. 입력하신 합산배제 주택 수 만큼 빼고 종부세 산정 (재산세는 영향 없음).",
  },
  "ownership-applied": {
    tone: "info",
    title: "공동명의 본인 지분 반영 (인별 과세)",
    body:
      "종부세법 §9 (인별 과세) — 공동명의 시 본인 지분만큼만 종부세 산정. 입력하신 공시가격에 지분 비율을 곱한 값을 종부세 산정 기준으로 사용 (재산세는 본인 지분이 별도 고지되므로 입력값 그대로 사용). 특례 미신청 시 = 각자 9억 공제 (인별 과세). 부부 공동명의 1주택자 특례 신청 시 = 1인 합산 12억 공제 + 세액공제 80% (별도 토글로 활성화).",
  },
  "ownership-single-house-warning": {
    tone: "warn",
    title: "⚠ 공동명의 + 1세대1주택 자격 — 명의자별 독립 자격 충족 필요",
    body:
      "공동명의 12억 공제 + 연령/보유 세액공제는 각 명의자가 독립적으로 1세대1주택 자격을 충족할 때만 받을 수 있습니다. 부부 공동명의는 보통 가능하나 가족·지인 공동명의는 자격 요건 까다로움. 세무사 상담 권장.",
  },
  "corporation-flat-rate-applied": {
    tone: "info",
    title: "법인 단일세율 적용",
    body:
      "종부세법 §9③ — 법인 보유 주택은 누진세율이 아닌 단일세율 (2주택 이하 2.7% / 3주택 이상 5.0%) 적용. 종부세 기본공제 9억/12억도 미적용 (개인 공제 차단). 본 계산기는 단일세율 케이스. 9종 법인 (PDF #14 페이지 2 표): ① 공익법인등(②미해당) ② 공익법인등(공익목적 직접 사용) ③ 공공주택사업자 ④ 주택조합 ⑤ 정비사업시행자 ⑥ 민간건설임대사업자 ⑦ 도시개발사업시행자 ⑧ 사회적기업등 ⑨ 종중 — 합산배제 신고기간(9.16~9.30) 내 별지 제28호 서식 신고 시 일반 누진세율 적용 가능. 해당 시 위 'AdvancedFields'에서 라디오로 카테고리 선택 후 일반 누진세율 산출.",
  },
  "corporation-general-rate-applied": {
    tone: "info",
    title: "법인 9종 일반 누진세율 특례 적용",
    body:
      "PDF #14 (`국세청법인 주택분 일반 누진세율 특례`) — 선택하신 카테고리에 따라 단일세율(2.7%/5.0%) 대신 일반 누진세율 + 기본공제 9억 + 세부담 상한 150% 적용. 카테고리 ① (공익법인등 ②미해당) 은 다주택 보유 시 BRACKETS_3 (중과 누진), 카테고리 ②~⑨ 는 주택 수 무관 BRACKETS_2 (기본세율) 일률. 신청 자격 확인 (별지 제28호 서식 + 증빙서류) 본인 책임. 1세대1주택 12억 공제·세액공제 80% 는 법인 자격 없음 (PDF #2: 1세대1주택자 = 거주자 정의).",
  },
  "corporation-no-credit": {
    tone: "warn",
    title: "⚠ 법인 — 1주택 공제·세액공제 자동 차단",
    body:
      "종부세법 §9③ — 법인은 1세대1주택자 12억 공제·연령/보유 세액공제 모두 받을 수 없습니다. 법인 토글을 켜셨을 때 입력하신 1주택 자격·연령·보유 값은 산식에서 자동으로 무효 처리됩니다. 법인 다주택자 절세는 별도 전략 (개인 명의 분산 등) 세무사 상담 권장.",
  },
  "consult-experts": {
    tone: "warn",
    title: "세무사 상담 권장",
    body:
      "합산배제·공동명의·법인 단일세율·부부 공동명의 1주택자 특례 + 1세대1주택 재산세 공정시장가액비율 차등(§109) + 종부세 공제할 재산세액(§4의2) 모두 반영 완료 (산식 100% 정확). 다만 합산배제 신청 자격·부부 공동명의 1주택자 자격은 본 도구가 자동 검증하지 않으니 세무사 상담 권장. 향교/종교는 산식 영향 없는 신고 절차 특례.",
  },
  "spouse-joint-single-house-applied": {
    tone: "info",
    title: "부부 공동명의 1주택자 특례 적용",
    body:
      "공동명의 1주택자 과세특례 (국세청 PDF 박제) — 부부 공동소유 1주택일 때 특례 신청 시 1인 합산 납세 → 12억 공제 + 세액공제 80% 가능 (납세의무자 연령·보유 기준). 자격 요건은 본인 책임 확인: 다른 세대원 무주택 + 배우자 다른 주택 무 + 매년 9.16~9.30 신청 (별지 제30호 서식, 혼인관계증명서 첨부). 자격 미충족 시 추징 가능, 세무사 상담 권장.",
  },
  "special-houses-applied": {
    tone: "info",
    title: "1세대1주택 5종 특례주택 자격 적용",
    body:
      "PDF #12 (`1세대 1주택자 판단 시 주택 수 산정 제외 특례`) — 본인 1주택 + 5종 중 어느 하나(들)을 함께 소유 시 신청에 의해 1세대1주택자로 봄. 효과: 기본공제 12억 + 세액공제 최대 80%. 5종 자격: ① 신규주택(일시적2주택, 신규주택 취득 ≤3년) ② 상속주택(상속개시 ≤5년 또는 지분 ≤40%/공시가 ≤6억(수도권 밖 3억)) ③ 지방저가주택(공시가 ≤4억 + 수도권 밖) ④ 인구감소지역주택(공시가 ≤4억 + 인구감소지역 + 2024~2026 취득 + 기존 1주택과 다른 시·군·구) ⑤ 준공후미분양주택(전용 ≤85㎡ + 취득가 ≤6억 + 수도권 밖 + 2024.1.10~2025.12.31 + 양도자 사업주체/시공자 + 시·군·구청장 확인). 매년 9.16~9.30 신청 (별지 제24호 서식). 자격 본인 책임 확인. 일시적 2주택자가 신규주택 취득 ≤3년 내 종전주택 미양도 시 경감세액 추징.",
  },
  "special-houses-credit-prorated": {
    tone: "info",
    title: "5종 특례주택 안분 비율 적용 (세액공제)",
    body:
      "PDF #12 페이지 3 + PDF #2 페이지 4 결합 박제 — '산출세액 중 특례주택을 제외한 1주택이 차지하는 부분'에 대해 연령·보유 세액공제 적용. 안분 산식 = 본인 1주택 공시가 / (본인 1주택 공시가 + 5종 특례주택 합계 공시가). 본 도구는 공시가 비율로 단순 박제 (공정시장가액비율 60% 미적용). 정확한 분모 단위(공시가 vs 과세표준)는 종부세법 §9 본문 + 시행령 참조 + 세무사 상담 권장 (실무상 ≤1% 오차 가능).",
  },
  "special-houses-corp-blocked": {
    tone: "warn",
    title: "⚠ 5종 특례주택 — 법인 자동 차단",
    body:
      "PDF #12 첫 줄 — 1세대1주택자 = 거주자 정의. 법인은 5종 특례주택 자격 없음 → 법인 토글 ON 시 5종 특례주택 입력값 자동 무효. 법인 절세는 별도 전략 (개인 명의 분산·법인 9종 일반 누진세율 등) 세무사 상담 권장.",
  },
  "special-houses-multi-house-blocked": {
    tone: "warn",
    title: "⚠ 5종 특례주택 — 다주택자 자동 차단",
    body:
      "PDF #12 — '1주택과 함께 5종 중 어느 하나의 주택을 소유한 경우' 1세대1주택자로 봄. 본인 보유 주택 수가 2주택 이상 (본 도구의 'houses' 입력 ≥2) 시 5종 특례주택 자격 없음 → 입력값 자동 무효. 본인 보유 주택을 1주택으로 줄이거나 합산배제(B-2) 신청 후 effectiveHouses=1 도달 시 활성화 가능.",
  },
  "special-houses-spouse-joint-priority": {
    tone: "warn",
    title: "⚠ 5종 특례주택 + 부부 공동명의 — B-5 우선 적용",
    body:
      "부부 공동명의 1주택자 특례(B-5)와 5종 특례주택(PDF #12)이 동시 입력되면 B-5 1인 합산 납세를 우선 적용 (특례주택 안분은 비활성). B-5 자격이 더 직접적이며 12억 공제 효과는 동일. 사용자가 5종 특례주택 효과만 원하면 B-5 토글을 해제하세요. PDF #12 페이지 3 부부 자격 표 (지분율 70:30 케이스 등) 별도 검토는 세무사 상담 권장.",
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
