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
}

const PLANS: Plan[] = [
  {
    name: "기본",
    planKey: "basic_30d",
    features: ["단지 검색·매물 조회", "시세 조회", "필터 7종", "엑셀 내보내기"],
  },
  {
    name: "프로",
    planKey: "pro_30d",
    highlight: true,
    features: [
      "기본 플랜 모든 기능",
      "단지 비교 (최대 4개)",
      "미분양 비교 + 레이더 차트",
      "공공 실거래가 분석",
      "우선 지원",
    ],
  },
];

export default function PlanCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
      {PLANS.map((plan) => (
        <PlanCard key={plan.name} plan={plan} />
      ))}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const { name, planKey, features, highlight } = plan;
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
        <p className="text-2xl font-bold text-text-primary">
          ₩ <span className="text-gray-500">출시 시 공개</span>
        </p>
        <p className="text-xs text-gray-600 mt-1">7일 무료 체험 · 신용카드 없이 시작</p>
      </div>
      <ul className="space-y-2 my-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <CircleCheckBig className="w-4 h-4 text-accent-green shrink-0 mt-0.5" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <CheckoutButton planKey={planKey} highlight={highlight} />
    </Card>
  );
}
