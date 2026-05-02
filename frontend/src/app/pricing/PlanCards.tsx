import Link from "next/link";

interface Plan {
  name: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "기본",
    features: ["단지 검색·매물 조회", "시세 조회", "필터 7종", "엑셀 내보내기"],
  },
  {
    name: "프로",
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
  const { name, features, highlight } = plan;
  return (
    <div
      className={`bg-white rounded-xl p-6 ${
        highlight ? "border-2 border-blue-500 shadow-md relative" : "border border-gray-200"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
          인기
        </span>
      )}
      <h3 className="text-lg font-bold text-gray-900 mb-1">{name}</h3>
      <p className="text-2xl font-bold text-gray-900 mb-1">
        ₩ <span className="text-gray-400">추후 공개</span>
      </p>
      <p className="text-xs text-gray-500 mb-4">/ 월</p>
      <ul className="space-y-2 mb-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-blue-600 mt-0.5" aria-hidden>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`block w-full text-center font-medium text-sm py-2.5 rounded-lg transition ${
          highlight
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-gray-100 hover:bg-gray-200 text-gray-800"
        }`}
      >
        무료 체험 시작
      </Link>
    </div>
  );
}
