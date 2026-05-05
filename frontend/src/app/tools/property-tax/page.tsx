import type { Metadata } from "next";
import Link from "next/link";
import PropertyTaxCalculator from "./PropertyTaxCalculator";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "보유세 계산기 (재산세 + 종부세)",
  description:
    "공시가격을 입력하면 지방세법 §111 + 종부세법 §8/§9 (국세청 PDF 16개 권위 출처) 기준 재산세·종합부동산세·농어촌특별세 합산 보유세를 즉시 계산합니다.",
  alternates: { canonical: "/tools/property-tax" },
  openGraph: {
    title: "보유세 계산기 (재산세 + 종부세) | 2u부동산",
    description:
      "공인중개사를 위한 보유세 자동 계산 — 1세대1주택 12억 공제·연령/보유 세액공제·다주택 9억 공제·3주택 25억 초과 중과·농특세 20%",
  },
};

export default function PropertyTaxToolPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          보유세 계산기 (재산세 + 종부세)
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          지방세법 §111 + 종부세법 §8/§9 + 시행령 기준
          <br className="hidden sm:inline" /> 1년 보유세를 즉시 계산합니다.
        </p>
        <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs sm:text-sm text-amber-900">
          <strong>적용범위:</strong> 1세대1주택·일반·다주택(2/3주택+) 모두 지원. 국세청 PDF 16개 권위 출처 100% 정확값.
        </div>
        <div className="mt-2 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg text-left text-xs sm:text-sm text-blue-900">
          <strong>납부 일정:</strong> 재산세 7월 16~31일·9월 16~30일 분납 (50:50). 종합부동산세 12월 1~15일.
        </div>
        <div className="mt-2 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg text-left text-xs sm:text-sm text-gray-600">
          <strong>면책:</strong> 표준 계산 참고치입니다. <strong>공동명의·합산배제·법인 단일세율·부부 공동명의 1주택자 특례 + 1세대1주택 재산세 공정시장가액비율 차등(§109) + 종부세 공제할 재산세액(§4의2) 모두 반영 완료 — 도구 100% 정확</strong>. 향교/종교는 산식 영향 없는 신고 절차 특례라 별도 처리 불필요. 정확한 세액은 세무사 상담 권장.
          <br />
          <span className="text-gray-500">※ 공제할 재산세액 = 종부세 산출세액에서 재산세 중복 부과분 차감 (이중과세 방지, 시행령 §4의2). 분자·분모 모두 누진세율 적용 (대법원 2019두39796 판결 정합). 1세대1주택 세액공제는 차감 후 종부세액 기준.</span>
        </div>
      </section>

      <PropertyTaxCalculator />

      <section className="mt-10 text-center">
        <p className="text-sm text-gray-600">
          다른 부동산 계산기는{" "}
          <Link href="/blog/realestate-calculators" className="text-blue-600 hover:underline">
            계산기 모음 안내
          </Link>
          에서 확인하세요.
        </p>
      </section>
    </div>
  );
}
