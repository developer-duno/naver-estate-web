/**
 * 인증 페이지 전용 layout — Header·Footer 분리 + 컴팩트 로고만
 * 적용 페이지: /login · /signup · /forgot-password · /verify
 * Why: 40~60대 공인중개사 페르소나 = 단순 폼 우선. 메인 Header 햄버거 + Footer 정보 양보로 인증 집중도 향상
 * Next.js 16 App Router route group 패턴 = URL 변화 0
 */
import Link from "next/link";
import { Toaster } from "sonner";
import Providers from "@/components/Providers";

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Link
            href="/"
            className="text-lg font-heading font-semibold text-ink hover:opacity-80"
          >
            2u부동산
          </Link>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <Toaster position="bottom-right" richColors />
    </Providers>
  );
}
