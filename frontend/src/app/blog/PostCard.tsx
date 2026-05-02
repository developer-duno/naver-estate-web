import Link from "next/link";
import type { BlogPost } from "./posts";

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

export default function PostCard({ post }: { post: BlogPost }) {
  const categoryClass = CATEGORY_COLOR[post.category] ?? "bg-gray-100 text-gray-700";
  const wrapperClass =
    "block bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-400 hover:shadow-sm transition";

  const inner = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${categoryClass}`}>
          {post.category}
        </span>
        {post.draft && (
          <span className="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-500">
            준비 중
          </span>
        )}
      </div>
      <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2 leading-snug">
        {post.title}
      </h2>
      <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed line-clamp-2">
        {post.description}
      </p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(post.date)}</span>
        <span>약 {post.readingTime}분</span>
      </div>
    </>
  );

  if (post.draft) {
    return (
      <div className={`${wrapperClass} opacity-70 cursor-default`} aria-disabled>
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/blog/${post.slug}`} className={wrapperClass}>
      {inner}
    </Link>
  );
}
