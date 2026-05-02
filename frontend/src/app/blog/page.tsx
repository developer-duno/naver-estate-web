import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "./posts";
import PostCard from "./PostCard";

export const metadata: Metadata = {
  title: "블로그 — 공인중개사를 위한 인사이트",
  description:
    "전세가율·단지 시세 분석·미분양 활용법 등 공인중개사 실무에 필요한 부동산 인사이트를 정리합니다.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "블로그 — 공인중개사를 위한 인사이트 | 2u부동산",
    description:
      "전세가율·시세 분석·미분양·매물 조회 노하우. 공인중개사 실무에 바로 쓰는 글 모음.",
    type: "website",
  },
};

export default function BlogIndexPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <section className="text-center mb-10 sm:mb-14">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          공인중개사를 위한
          <br className="sm:hidden" />
          <span className="sm:ml-2">부동산 인사이트</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          시세 분석·세금 계산·미분양 활용법까지. 실무에 바로 쓰는 부동산 콘텐츠를 정리합니다.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {POSTS.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </section>

      <section className="bg-blue-50 border border-blue-200 rounded-xl p-6 sm:p-8 text-center">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
          글에서 다룬 도구를 직접 써보세요
        </h2>
        <p className="text-sm text-gray-600 mb-4">7일 무료 체험으로 모든 분석 기능을 이용할 수 있어요.</p>
        <Link
          href="/signup"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm sm:text-base px-6 py-3 rounded-lg shadow-sm transition"
        >
          무료로 시작하기 →
        </Link>
      </section>
    </div>
  );
}
