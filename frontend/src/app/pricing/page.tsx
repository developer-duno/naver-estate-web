import type { Metadata } from "next";
import Link from "next/link";
import PlanCards from "./PlanCards";

export const metadata: Metadata = {
  title: "요금제",
  description:
    "공인중개사를 위한 부동산 매물·시세 분석 도구 — 7일 무료 체험. 기본·프로 두 플랜으로 매물·시세·미분양·실거래가를 한 번에 분석하세요.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "요금제 | 2u부동산",
    description:
      "공인중개사를 위한 부동산 매물·시세 분석 도구 — 7일 무료 체험으로 시작",
  },
};

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Hero */}
      <section className="text-center mb-12 sm:mb-16">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          공인중개사를 위한
          <br className="sm:hidden" />
          <span className="sm:ml-2">매물·시세 분석 도구</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-6 leading-relaxed">
          지금 가입하면 <strong className="text-blue-600">7일 무료 체험</strong>으로 모든 기능을 써볼 수 있어요.
          <br className="hidden sm:inline" />
          신용카드 등록 없이 시작 가능합니다.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm sm:text-base px-6 py-3 rounded-lg shadow-sm transition"
        >
          무료로 시작하기 →
        </Link>
      </section>

      {/* 기능 하이라이트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-12 sm:mb-16">
        <Feature icon="📊" title="실시간 단지 시세" desc="네이버 부동산 시세를 실시간으로 가져와 평당가·전세가율까지 분석" />
        <Feature icon="🔎" title="매물 필터·비교" desc="가격·면적·층수·방향 등 7가지 필터 + 단지 4개까지 비교표·차트" />
        <Feature icon="📈" title="미분양 분석" desc="전국 미분양 단지 + 9축 레이더 차트로 투자·실거주 우위 한눈에" />
        <Feature icon="📥" title="엑셀 내보내기" desc="매물 목록·비교 결과를 엑셀로 즉시 다운로드 (수식 인젝션 방어)" />
      </section>

      {/* 요금제 카드 */}
      <section className="mb-12 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-6">요금제</h2>
        <PlanCards />
        <p className="text-xs text-gray-500 text-center mt-4">
          * 가격은 정식 출시와 함께 공개됩니다. 7일 무료 체험은 모든 플랜에 적용됩니다.
        </p>
      </section>

      {/* FAQ */}
      <section className="mb-12 sm:mb-16">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-6">자주 묻는 질문</h2>
        <div className="space-y-4 max-w-3xl mx-auto">
          <FAQItem
            q="공인중개사가 아니어도 가입할 수 있나요?"
            a="가입은 누구나 가능하지만, 매물 상세·시세·비교 같은 핵심 기능은 공인중개사 인증 후 이용 가능합니다. 가입 후 사업자등록번호로 자동 검증을 시도하며, 실패 시 관리자 수동 승인 절차가 있습니다."
          />
          <FAQItem
            q="무료 체험이 끝나면 자동으로 결제되나요?"
            a="아니요. 7일 무료 체험은 신용카드 등록 없이 시작합니다. 체험 종료 후 별도로 결제 수단을 등록해야 유료 플랜으로 전환됩니다."
          />
          <FAQItem
            q="결제는 어떤 방법으로 가능한가요?"
            a="정식 출시와 함께 신용카드·계좌이체 등 결제 수단을 안내해 드립니다. 출시 전까지는 사전 신청을 받고 있어요."
          />
          <FAQItem
            q="환불 정책은 어떻게 되나요?"
            a="결제 후 7일 이내 사용 이력이 없으면 전액 환불됩니다. 자세한 환불 규정은 정식 출시 시 약관에 명시됩니다."
          />
          <FAQItem
            q="데이터는 얼마나 자주 갱신되나요?"
            a="단지 매물은 12시간마다 자동 수집되며, 사용자가 단지를 클릭하는 순간 즉시 최신 매물을 가져옵니다. 시세 이력은 주 1회, 공공 실거래가는 주말마다 갱신됩니다."
          />
        </div>
      </section>

      {/* CTA 푸터 */}
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-6 sm:p-8 text-center">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
          지금 바로 7일 무료 체험을 시작하세요
        </h2>
        <p className="text-sm text-gray-600 mb-4">신용카드 없이 가입하고 모든 기능을 써볼 수 있어요.</p>
        <Link
          href="/signup"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm sm:text-base px-6 py-3 rounded-lg shadow-sm transition"
        >
          회원가입 →
        </Link>
      </section>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-3xl mb-2" aria-hidden>
        {icon}
      </div>
      <h3 className="font-semibold text-gray-800 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="bg-white border border-gray-200 rounded-lg p-4 group">
      <summary className="font-medium text-sm text-gray-800 cursor-pointer list-none flex justify-between items-center">
        <span>{q}</span>
        <span className="text-gray-400 group-open:rotate-180 transition" aria-hidden>
          ▾
        </span>
      </summary>
      <p className="text-sm text-gray-600 mt-3 leading-relaxed">{a}</p>
    </details>
  );
}

