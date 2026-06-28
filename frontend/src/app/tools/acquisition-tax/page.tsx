import type { Metadata } from "next";
import Link from "next/link";
import AcquisitionCalculator from "./AcquisitionCalculator";

export const metadata: Metadata = {
  title: "취득세 계산기",
  description:
    "매매가·주택수·면적을 입력하면 지방세법 + 농특세법 + 지방세특례제한법(생애최초) 기준 취득세 본세·농특세·교육세를 즉시 계산합니다.",
  alternates: { canonical: "/tools/acquisition-tax" },
  openGraph: {
    title: "취득세 계산기 | 2u부동산",
    description: "공인중개사를 위한 취득세 자동 계산 — 1주택 표준·다주택 중과·생애최초 감면·오피스텔까지 모두 지원",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(빌드 실측 확인)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

export default function AcquisitionTaxToolPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          취득세 계산기
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          지방세법 + 농특세법 + 지방세특례제한법 기준
          <br className="hidden sm:inline" /> 본세·농특세·교육세 합계를 즉시 계산합니다.
        </p>
        <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs sm:text-sm text-amber-900">
          <strong>안내:</strong> 본 계산은 표준 세율 기준 참고치입니다. 일시적 2주택·출산가구·인구감소지역 등 특례는
          반영되지 않으며, 정확한 세액은 관할 시·군·구청 또는 위택스에서 확인하세요.
        </div>
      </section>

      <AcquisitionCalculator />

      <section className="mt-10 text-center">
        <p className="text-sm text-gray-600">
          다른 계산기는{" "}
          <Link href="/tools" className="text-blue-600 hover:underline">
            계산기 모음
          </Link>
          에서 찾아보세요. 자세한 사용법은{" "}
          <Link href="/blog/realestate-calculators" className="text-blue-600 hover:underline">
            계산기 안내 글
          </Link>
          을 참고하세요.
        </p>
      </section>
    </div>
  );
}
