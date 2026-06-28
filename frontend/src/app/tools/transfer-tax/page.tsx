import type { Metadata } from "next";
import Link from "next/link";
import TransferCalculator from "./TransferCalculator";
import { EXEMPTION_END_DATE } from "@/lib/transfer-tax";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "양도소득세 계산기",
  description:
    "양도가액·취득가액·보유·거주연수를 입력하면 소득세법 §95② + §104 (9 권위 출처 교차검증) 기준 양도소득세 본세를 즉시 계산합니다.",
  alternates: { canonical: "/tools/transfer-tax" },
  openGraph: {
    title: "양도소득세 계산기 | 2u부동산",
    description:
      "공인중개사를 위한 양도세 자동 계산 — 1세대1주택 비과세·12억 초과 안분·중과 한시배제·미등기·장기보유공제 표1/표2 모두 지원",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(빌드 실측 확인)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

const MS_PER_DAY = 86_400_000;

function computeDaysLeft(endDate: string): number {
  const todayISO = new Date().toISOString().slice(0, 10);
  const endMs = new Date(endDate + "T00:00:00+09:00").getTime();
  const todayMs = new Date(todayISO + "T00:00:00+09:00").getTime();
  if (!Number.isFinite(endMs) || !Number.isFinite(todayMs)) return 0;
  return Math.max(0, Math.ceil((endMs - todayMs) / MS_PER_DAY));
}

export default function TransferTaxToolPage() {
  const daysLeft = computeDaysLeft(EXEMPTION_END_DATE);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          양도소득세 계산기
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mb-4 leading-relaxed">
          소득세법 §95② + §104 + 시행령 §159의3 기준
          <br className="hidden sm:inline" /> 본세를 즉시 계산합니다.
        </p>
        <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs sm:text-sm text-amber-900">
          <strong>적용범위:</strong> 1세대1주택·일반·미등기·다주택 모두 지원. 9 권위 출처 교차검증.
        </div>
        {daysLeft > 0 && (
          <div className="mt-2 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-left text-xs sm:text-sm text-red-900">
            <strong>한시배제 D-{daysLeft}</strong> · 다주택 중과·장특공 배제는 {EXEMPTION_END_DATE} 양도분까지.
          </div>
        )}
        <div className="mt-2 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg text-left text-xs sm:text-sm text-gray-600">
          <strong>면책:</strong> 표준 계산 참고치입니다. 4구 보완·상생임대주택·일시적2주택 특례는 별도 검토.
        </div>
      </section>

      <TransferCalculator />

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
