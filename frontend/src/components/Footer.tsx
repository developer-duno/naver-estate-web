import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <p>
            매물 정보의 정확성·완전성·적시성을 보장하지 않습니다. 거래 시
            반드시 공인중개사를 통해 확인하시기 바랍니다.
          </p>
          <p className="text-xs text-gray-500">
            데이터 출처: 네이버 부동산, 국토교통부 공공데이터, 에어코리아,
            응급의료정보, 보육통합정보(CPMS), 경찰청 범죄통계
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="법적 고지"
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
          >
            <Link
              href="/terms"
              className="text-gray-700 hover:text-blue-600 hover:underline"
            >
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="text-gray-700 hover:text-blue-600 hover:underline"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/refund"
              className="text-gray-700 hover:text-blue-600 hover:underline"
            >
              환불정책
            </Link>
            <Link
              href="/help"
              className="text-gray-700 hover:text-blue-600 hover:underline"
            >
              도움말
            </Link>
          </nav>
          <p className="text-xs text-gray-500">
            © {year} 2u부동산 — 공인중개사를 위한 매물·시세 분석 도구
          </p>
        </div>
      </div>
    </footer>
  );
}
