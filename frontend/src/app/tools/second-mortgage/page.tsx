import type { Metadata } from "next";
import BrandCard from "@/components/brand/BrandCard";
import SecondMortgageCalculator from "@/components/SecondMortgageCalculator";
import ToolLinks from "@/components/tools/ToolLinks";
import ToolPage from "@/components/tools/ToolPage";

export const metadata: Metadata = {
  title: "후순위 대출 한도 계산기",
  description:
    "우리 집 시세·남아 있는 대출·담보 인정 비율·연 이자율을 넣으면 집을 담보로 더 받을 수 있는 한도와 매달 낼 이자를 계산합니다.",
  alternates: { canonical: "/tools/second-mortgage" },
  openGraph: {
    url: "/tools/second-mortgage",
    title: "후순위 대출 한도 계산기 | 2u부동산",
    description: "집 시세에서 남는 만큼 — 추가 대출 한도와 매달 이자 계산",
    // openGraph 직접 지정 시 root opengraph-image 자동 상속이 끊겨 브랜드 PNG og 를 명시(seo-metadata 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

export default function SecondMortgageToolPage() {
  return (
    <ToolPage
      eyebrow="계산기 · 로그인 없이"
      title="후순위 대출 한도 계산기"
      description={
        <>
          이미 받은 대출이 있어도, 집 시세에서 남는 만큼을 담보로 추가 대출을 받는 방법입니다.
          <br className="hidden sm:inline" /> 한도와 매달 낼 이자를 먼저 계산해 보세요.
        </>
      }
      links={<ToolLinks current="second-mortgage" />}
    >
      {/* 계산기 안쪽은 홈 대출 판과 같은 부품 — 모양·글을 바꾸지 않는다(설계 T8 · §9 🟠5) */}
      <BrandCard className="p-5 sm:p-8">
        <SecondMortgageCalculator />
      </BrandCard>
    </ToolPage>
  );
}
