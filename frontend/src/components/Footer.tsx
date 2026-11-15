import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { REGION_PAGES_ENABLED } from "@/lib/seo/complex-page";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-brand-navy text-brand-on-navy-muted">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            실거래가·공시가격·관리비는 정부·공공기관이 공개한 자료로 보여
            드립니다. 계약 전에는 등기부등본과 공인중개사를 통해 한 번 더
            확인하세요.
          </p>
          <p className="text-xs">
            자료 출처: 국토교통부(실거래가·공시가격) · 한국부동산원(관리비·지역
            통계) · 국가데이터처(동네 통계) · 국립중앙의료원(응급의료) ·
            보육통합정보(어린이집) · 네이버 부동산(회원 매물)
          </p>
        </div>

        <nav
          aria-label="둘러보기"
          className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm"
        >
          <Link
            href="/tools"
            className="text-white hover:text-brand-orange hover:underline"
          >
            부동산 계산기 6종
          </Link>
          <Link
            href="/blog"
            className="text-white hover:text-brand-orange hover:underline"
          >
            블로그
          </Link>
        </nav>

        <div className="mt-6">
          <p className="text-sm font-semibold text-white">
            함께 보면 좋은 사이트
          </p>
          <nav
            aria-label="함께 보면 좋은 사이트"
            className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <a
              href="https://mibunyang-peach.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-2 rounded-lg border border-brand-navy-line p-4 transition-colors hover:border-brand-orange"
            >
              <span>
                <span className="block text-sm font-semibold text-white">
                  미분양 아파트 비교
                </span>
                <span className="mt-1 block text-xs">
                  전국 미분양 아파트를 모아 비교해요
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
            </a>
            <a
              href="https://sangga-one.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-2 rounded-lg border border-brand-navy-line p-4 transition-colors hover:border-brand-orange"
            >
              <span>
                <span className="block text-sm font-semibold text-white">
                  상가 공간분석
                  <span className="ml-2 text-xs font-normal text-brand-on-navy-muted">
                    준비 중
                  </span>
                </span>
                <span className="mt-1 block text-xs">
                  상가 자리와 주변 상권을 살펴봐요
                </span>
              </span>
              <ExternalLink aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
            </a>
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-brand-navy-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="법적 고지"
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
          >
            <Link
              href="/terms"
              className="text-white hover:text-brand-orange hover:underline"
            >
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="text-white hover:text-brand-orange hover:underline"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/refund"
              className="text-white hover:text-brand-orange hover:underline"
            >
              환불정책
            </Link>
            <Link
              href="/updates"
              className="text-white hover:text-brand-orange hover:underline"
            >
              고쳤습니다
            </Link>
            {/* 지역 장 입구(결정 34) — 지역 장이 열렸을 때만(플래그 false 배포 때 404 링크 방지) ·
                미리 받기 끔(모든 장 푸터에 있어 켜 두면 /region 을 장마다 미리 그린다, v2 O3) */}
            {REGION_PAGES_ENABLED && (
              <Link
                href="/region"
                prefetch={false}
                className="text-white hover:text-brand-orange hover:underline"
              >
                지역별 실거래가
              </Link>
            )}
            <Link
              href="/help"
              className="text-white hover:text-brand-orange hover:underline"
            >
              도움말
            </Link>
          </nav>
          <p className="text-xs">
            © {year} 2u부동산 — 아파트·오피스텔 실거래가·공시가격 조회
          </p>
        </div>
      </div>
    </footer>
  );
}
