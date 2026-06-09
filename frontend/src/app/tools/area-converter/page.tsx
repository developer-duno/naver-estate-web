import type { Metadata } from "next";
import Link from "next/link";
import AreaConverter from "./AreaConverter";

export const metadata: Metadata = {
  title: "평·㎡ 면적 변환 계산기",
  description:
    "평수와 제곱미터를 양방향 즉시 변환합니다. 1평 = 3.3058㎡ 표준 환산식 기준, 입력 단위를 바꾸면 자동으로 반대 단위로 환산됩니다.",
  alternates: { canonical: "/tools/area-converter" },
  openGraph: {
    title: "평·㎡ 면적 변환 계산기 | 2u부동산",
    description: "공인중개사를 위한 평·㎡ 양방향 즉시 변환 — 1평 = 3.3058㎡ 표준식",
  },
};

export default function AreaConverterToolPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          평·㎡ 면적 변환 계산기
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          1평 = 3.3058㎡ 표준 환산식 기준
          <br className="hidden sm:inline" /> 입력 단위를 바꾸면 자동으로 반대 단위가 채워집니다.
        </p>
        <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs sm:text-sm text-amber-900">
          <strong>안내:</strong> 본 변환은 공인된 표준 환산식(1평 = 3.3058㎡) 기준 참고치입니다.
          공부상 면적이나 등기부 면적과 차이가 있을 수 있으니, 정확한 면적은 등기사항전부증명서나
          건축물대장에서 확인하세요.
        </div>
      </section>

      <AreaConverter />

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
