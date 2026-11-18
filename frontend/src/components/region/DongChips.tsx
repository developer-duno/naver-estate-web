import Link from "next/link";

export interface DongChip {
  name: string;
  /** 그 동 페이지 주소 */
  href: string;
}

/**
 * 동 장 아래 「다른 동」 칩(서버가 그림, 세션 484 PR 3c-1b) — 그 동 페이지로 가는 링크(미리 받기 끔, v2 O3).
 * 세션 526 B40 PR 2b: 새 색 · 허브 칩은 DongTabs(같은 장 안 고르기)로 옮겨 이 부품은 동 장 링크만 그린다.
 */
export default function DongChips({ chips, label }: { chips: DongChip[]; label: string }) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-full border border-brand-line bg-white px-3.5 text-sm text-brand-navy hover:bg-brand-bg"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
