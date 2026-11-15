import Link from "next/link";
import { POSTS, type BlogPost } from "@/app/blog/posts";

const LOAN_SLUG = "illegal-loan-filter";

/** 공개 글 중 최신 3편 — 대출 글(illegal-loan-filter)이 있으면 맨 앞(세션 508 · 승인 항목 13) */
export function homeGuidePosts(posts: BlogPost[], n = 3): BlogPost[] {
  const live = posts.filter((p) => !p.draft).sort((a, b) => b.date.localeCompare(a.date));
  const loan = live.find((p) => p.slug === LOAN_SLUG);
  const rest = live.filter((p) => p.slug !== LOAN_SLUG);
  return (loan ? [loan, ...rest] : rest).slice(0, n);
}

/** 홈 「가이드」 — 글 카드 3장 + 「글 전체 보기」 */
export default function HomeGuide({ posts = POSTS }: { posts?: BlogPost[] }) {
  const picks = homeGuidePosts(posts);
  if (picks.length === 0) return null;
  return (
    <section aria-labelledby="home-guide">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="home-guide" className="text-[22px] font-black tracking-tight text-brand-navy sm:text-[26px]">가이드</h2>
        <Link href="/blog" className="text-sm text-brand-muted hover:underline">글 전체 보기 →</Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] sm:gap-4">
        {picks.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="flex flex-col gap-1.5 rounded-xl bg-white p-[18px] hover:underline sm:gap-2.5 sm:rounded-2xl sm:p-6"
          >
            <span className="text-xs font-bold text-brand-orange-text sm:text-[13px]">{p.category}</span>
            <span className="text-base font-bold leading-snug text-brand-navy sm:text-lg">{p.title}</span>
            <span className="text-xs text-brand-muted sm:text-[13px]">{p.date.replace(/-/g, ".")}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
