import { CircleCheckBig } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CheckoutButton from "./CheckoutButton";
import type { PlanKey } from "@/types/payment";

interface Plan {
  name: string;
  planKey: PlanKey; // BE PLAN_PRICES(config/plans.py) 키 — 결제 prepare 식별자
  features: string[];
  highlight?: boolean;
  /** 무료체험 플랜(기본) — 결제 X, 카드 등록 시 7일 무료. */
  free?: boolean;
  /** 원가(할인 전, 줄긋기 표시). */
  originalPrice?: number;
  /** 할인가(실제 청구가) — ⚠ BE PLAN_PRICES[planKey].amount 와 반드시 일치 (사용자가 보는 가격=청구가). */
  price?: number;
  /** 할인율(%) 배지. */
  discountPct?: number;
  /** 결제 주기 라벨 ("월"/"년"). */
  period?: string;
}

// 가격(세션 326 사장님 확정): 월 10,000원(원가 100,000 90%↓) / 연 100,000원(원가 1,000,000 90%↓).
// ⚠ price 는 BE config/plans.py PLAN_PRICES[planKey].amount 와 짝꿍 — 한쪽 변경 시 양쪽 + 정합 가드(__tests__) 갱신.
//   pro_30d.amount=10000, pro_365d.amount=100000. (domain-mapping-ssot.md 패턴)
const PLANS: Plan[] = [
  {
    name: "기본",
    planKey: "basic_30d",
    free: true,
    features: ["단지 검색·매물 조회", "시세 조회", "필터 7종", "엑셀 내보내기"],
  },
  {
    name: "월간",
    planKey: "pro_30d",
    highlight: true,
    originalPrice: 100_000,
    price: 10_000,
    discountPct: 90,
    period: "월",
    features: [
      "모든 기능 이용",
      "단지 비교 (최대 4개)",
      "미분양 비교 + 레이더 차트",
      "공공 실거래가 분석",
      "우선 지원",
    ],
  },
  {
    name: "연간",
    planKey: "pro_365d",
    originalPrice: 1_000_000,
    price: 100_000,
    discountPct: 90,
    period: "년",
    features: [
      "월간 플랜 모든 기능",
      "1년 약정 (2만원 더 저렴)",
      "갱신 부담 없이 1년 이용",
    ],
  },
];

export default function PlanCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
      {PLANS.map((plan) => (
        <PlanCard key={plan.name} plan={plan} />
      ))}
    </div>
  );
}

/** 원 단위 금액을 천단위 콤마로 (예: 10000 → "10,000"). */
function formatWon(won: number): string {
  return won.toLocaleString("ko-KR");
}

function PlanCard({ plan }: { plan: Plan }) {
  const { name, planKey, features, highlight, free, originalPrice, price, discountPct, period } = plan;
  return (
    <Card
      className={
        highlight
          ? "relative p-6 ring-2 ring-accent-blue shadow-md gap-3"
          : "relative p-6 gap-3"
      }
    >
      {highlight && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-blue text-white">
          인기
        </Badge>
      )}
      <h3 className="font-heading text-lg font-bold text-text-primary">{name}</h3>
      <div>
        {free ? (
          // 무료체험: 가격 대신 "무료" + 안내
          <>
            <p className="text-2xl font-bold text-text-primary">무료</p>
            <p className="text-xs text-gray-600 mt-1">카드 등록 시 7일 무료 체험</p>
          </>
        ) : (
          // 유료(월/연): 90% 배지 + 원가 줄긋기 + 할인가
          <>
            {discountPct != null && (
              <Badge className="bg-red-600 text-white mb-1">{discountPct}% 할인</Badge>
            )}
            {originalPrice != null && (
              <p className="text-sm text-gray-400 line-through">
                ₩{formatWon(originalPrice)}
              </p>
            )}
            <p className="text-2xl font-bold text-text-primary">
              ₩{formatWon(price ?? 0)}
              {period && <span className="text-base font-medium text-gray-600">/{period}</span>}
            </p>
            <p className="text-xs text-gray-600 mt-1">7일 무료 체험 후 결제 · 언제든 해지</p>
          </>
        )}
      </div>
      <ul className="space-y-2 my-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <CircleCheckBig className="w-4 h-4 text-accent-green shrink-0 mt-0.5" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <CheckoutButton planKey={planKey} highlight={highlight} free={free} />
    </Card>
  );
}
