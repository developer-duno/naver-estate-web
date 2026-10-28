import Link from "next/link";

export interface DongChip {
  name: string;
  href: string;
  /** 동 페이지로 가나(파랑 링크) — 아니면 같은 장 안 앵커(회색) */
  page: boolean;
}

/**
 * 동 칩 목차(서버가 그림, 세션 484 PR 3c-1b) — 동 페이지가 있는 동 = 파랑 링크(미리 받기 끔, v2 O3),
 * 없는 동 = 회색 같은 장 앵커(`#동코드`, 다른 장으로 가지 않으니 일반 <a>).
 */
export default function DongChips({ chips, label }: { chips: DongChip[]; label: string }) {
  if (chips.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.href}>
            {c.page ? (
              <Link
                href={c.href}
                prefetch={false}
                className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-800 hover:bg-blue-100"
              >
                {c.name}
              </Link>
            ) : (
              <a
                href={c.href}
                className="inline-block rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                {c.name}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
