import Link from "next/link";
import SecondMortgageCalculator from "@/components/SecondMortgageCalculator";

/**
 * 홈 대출 판(세션 508 · 승인 항목 7) — 왼쪽 설명 + 오른쪽 한도·이자 계산기.
 * 금융위 등록 전이라 상담 신청·전화·제휴사 이름·금리 예시 수치는 두지 않는다.
 * 「후순위 담보대출이 뭔가요」 링크는 글이 생기면 붙인다(지금은 없음).
 */
export default function HomeLoanPanel() {
  return (
    <section
      aria-labelledby="home-loan"
      className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(11,31,58,0.14)] md:flex-row"
    >
      <div className="bg-brand-orange-soft p-5 sm:p-8 md:flex-1 md:p-10">
        <p className="text-[13px] font-bold text-brand-orange-text sm:text-sm">아파트 후순위 담보대출</p>
        <h2 id="home-loan" className="mt-2 text-[22px] font-black leading-snug tracking-tight text-brand-navy sm:text-[30px]">
          집을 담보로 더 받을 수 있는 한도부터 확인하세요
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-brand-muted sm:text-[15px]">
          이미 받은 대출이 있어도, 집 시세에서 남는 만큼을 담보로 추가 대출을 받는 방법입니다. 한도와 매달 낼 이자를
          먼저 계산해 보세요.
        </p>
        <Link
          href="/blog/illegal-loan-filter"
          className="mt-5 flex min-h-11 items-center justify-between rounded-[10px] bg-white px-4 py-3 text-[15px] font-medium text-brand-navy hover:underline"
        >
          <span>불법 대출 광고 거르는 법</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="p-5 sm:p-8 md:flex-1 md:p-10">
        <h3 className="mb-4 text-lg font-bold text-brand-navy">한도 · 이자 계산기</h3>
        <SecondMortgageCalculator />
      </div>
    </section>
  );
}
