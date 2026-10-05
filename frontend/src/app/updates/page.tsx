import type { Metadata } from "next";
import Link from "next/link";
import { getPublicUpdates, OPINION_PAGE_SIZE, type PublicUpdatesResponse } from "@/lib/api/opinions";
import { PUBLIC_STATUS_BADGE, formatKstDate } from "@/lib/opinion-labels";
import OpinionOpenButton from "./OpinionOpenButton";

const DESCRIPTION = "보내 주신 의견 중 답한 것·고친 것을 모아 둡니다.";

export const metadata: Metadata = {
  title: "고쳤습니다 — 보내 주신 의견과 답",
  description: `2u부동산에 ${DESCRIPTION}`,
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "고쳤습니다 — 보내 주신 의견과 답 | 2u부동산",
    description: `2u부동산에 ${DESCRIPTION}`,
    type: "website",
    // openGraph 를 직접 쓰면 root opengraph-image 상속이 끊긴다 → images 를 꼭 적는다(seo-metadata.md 룰 2)
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "2u부동산" }],
  },
};

type LoadResult = { ok: true; data: PublicUpdatesResponse } | { ok: false };

/** ?page= 값 → 1 이상 정수(이상한 값은 1쪽) */
function toPage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

async function load(page: number): Promise<LoadResult> {
  // 백엔드 주소가 없는 빌드(미리보기 등)는 빈 목록으로 본다 — 실패 문구를 띄울 일이 아니다
  if (!process.env.NEXT_PUBLIC_API_URL) return { ok: true, data: { items: [], total: 0, page } };
  try {
    return { ok: true, data: await getPublicUpdates(page) };
  } catch {
    return { ok: false };
  }
}

/**
 * "고쳤습니다" 공개 목록 (세션 437 PR C) — 서버 컴포넌트가 목록을 받아 첫 HTML 에 본문을 싣는다
 * (봇도 본문을 받는다 — seo-metadata.md 룰 3). 백엔드 응답은 Next 캐시 5분.
 */
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = toPage((await searchParams).page);
  const result = await load(page);
  const lastPage = result.ok ? Math.max(1, Math.ceil(result.data.total / OPINION_PAGE_SIZE)) : 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">고쳤습니다</h1>
        <p className="text-sm text-gray-600">{DESCRIPTION}</p>
        <OpinionOpenButton />
        <p className="text-xs text-gray-500">공개 뒤 이 목록에 보이기까지 몇 분 걸릴 수 있어요.</p>
      </header>

      {!result.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          지금은 목록을 불러올 수 없어요.
        </p>
      ) : result.data.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          아직 공개한 항목이 없어요.
        </p>
      ) : (
        <ul className="space-y-3">
          {result.data.items.map((item) => {
            const badge = PUBLIC_STATUS_BADGE[item.status] ?? PUBLIC_STATUS_BADGE.new;
            return (
              <li key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  <time dateTime={item.published_at ?? undefined} className="text-xs text-gray-500">
                    {formatKstDate(item.published_at)}
                  </time>
                </div>
                <h2 className="mt-2 font-semibold text-gray-900">{item.public_title}</h2>
                {/* 줄바꿈은 CSS 로만 살린다 — HTML 로 넣지 않는다 */}
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">{item.public_answer}</p>
              </li>
            );
          })}
        </ul>
      )}

      {result.ok && result.data.total > OPINION_PAGE_SIZE && (
        <nav aria-label="쪽 넘기기" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/updates?page=${page - 1}`} className="rounded border px-3 py-1 hover:bg-gray-50">
              이전
            </Link>
          ) : (
            <span className="rounded border px-3 py-1 opacity-30">이전</span>
          )}
          <span className="text-gray-500">
            {page} / {lastPage} 쪽
          </span>
          {page < lastPage ? (
            <Link href={`/updates?page=${page + 1}`} className="rounded border px-3 py-1 hover:bg-gray-50">
              다음
            </Link>
          ) : (
            <span className="rounded border px-3 py-1 opacity-30">다음</span>
          )}
        </nav>
      )}
    </div>
  );
}
