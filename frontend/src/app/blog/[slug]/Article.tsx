import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogPost } from "../posts";
import BlogHero from "@/components/blog/BlogHero";

const CATEGORY_COLOR: Record<string, string> = {
  "시세 분석": "bg-blue-100 text-blue-700",
  "세금": "bg-amber-100 text-amber-700",
  "미분양": "bg-rose-100 text-rose-700",
  "도구 활용": "bg-emerald-100 text-emerald-700",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function Article({
  post,
  children,
}: {
  post: BlogPost;
  children: ReactNode;
}) {
  const categoryClass = CATEGORY_COLOR[post.category] ?? "bg-gray-100 text-gray-700";

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <nav className="mb-6 text-xs sm:text-sm text-gray-500">
        <Link href="/blog" className="hover:text-gray-700">
          ← 블로그 목록으로
        </Link>
      </nav>

      <BlogHero post={post} priority />

      <header className="mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${categoryClass}`}>
            {post.category}
          </span>
          {post.draft && (
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-500">
              준비 중
            </span>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-3">
          {post.title}
        </h1>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed mb-3">
          {post.description}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{formatDate(post.date)}</span>
          <span aria-hidden>·</span>
          <span>약 {post.readingTime}분</span>
        </div>
      </header>

      <div className="mdx-content">{children}</div>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 sm:p-8 text-center">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
            지금 바로 7일 무료 체험을 시작하세요
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            글에서 다룬 분석 도구를 직접 써볼 수 있어요. 신용카드 등록 없이 시작합니다.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm sm:text-base px-6 py-3 rounded-lg shadow-sm transition"
          >
            무료로 시작하기 →
          </Link>
        </div>
      </footer>
    </article>
  );
}
