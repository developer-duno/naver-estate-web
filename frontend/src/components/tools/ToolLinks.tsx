import Link from "next/link";

/** 계산기 장 주소의 끝 이름(/tools/<이름>) */
export type ToolSlug =
  | "second-mortgage"
  | "brokerage-fee"
  | "acquisition-tax"
  | "transfer-tax"
  | "property-tax"
  | "area-converter";

/**
 * 세금·수수료·평㎡ 계산기 칩 — 순서와 이름은 머리 메뉴 「계산기 ▾」와 같다.
 * 후순위 대출 한도는 넣지 않는다(설계 §9 🟡g — 「계산기 모음」 칩으로 갈 수 있다).
 */
export const TAX_TOOL_CHIPS: { slug: Exclude<ToolSlug, "second-mortgage">; title: string }[] = [
  { slug: "brokerage-fee", title: "중개수수료" },
  { slug: "acquisition-tax", title: "취득세" },
  { slug: "transfer-tax", title: "양도소득세" },
  { slug: "property-tax", title: "보유세" },
  { slug: "area-converter", title: "평·㎡ 변환" },
];

const CHIP_CLASS =
  "inline-flex min-h-11 items-center rounded-full border border-brand-line bg-white px-4 text-sm font-medium text-brand-navy hover:bg-brand-bg";
const TEXT_LINK_CLASS = "font-medium text-brand-orange-text hover:underline";

/**
 * 계산기 장 바닥 링크(세션 530 · B40 PR 3a · 설계 T1).
 * - 후순위 장: 지금의 두 링크(계산기 모음 · 불법 대출 광고 거르는 법)를 글 그대로.
 * - 세금·수수료·평㎡ 장: 다른 계산기 칩(자기 자신 뺌) + 계산기 모음 + 계산기 안내 글.
 */
export default function ToolLinks({ current }: { current: ToolSlug }) {
  if (current === "second-mortgage") {
    return (
      <section className="mt-10 text-center">
        <p className="text-sm text-brand-muted">
          다른 계산기는{" "}
          <Link href="/tools" className={TEXT_LINK_CLASS}>
            계산기 모음
          </Link>
          에서 찾아보세요. 대출 광고를 볼 때는{" "}
          <Link href="/blog/illegal-loan-filter" className={TEXT_LINK_CLASS}>
            불법 대출 광고 거르는 법
          </Link>
          을 먼저 읽어 보세요.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-10">
      <ul className="flex flex-wrap justify-center gap-2">
        {TAX_TOOL_CHIPS.filter((c) => c.slug !== current).map((c) => (
          <li key={c.slug}>
            <Link href={`/tools/${c.slug}`} className={CHIP_CLASS}>
              {c.title}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/tools" className={CHIP_CLASS}>
            계산기 모음
          </Link>
        </li>
        <li>
          <Link href="/blog/realestate-calculators" className={CHIP_CLASS}>
            계산기 안내 글
          </Link>
        </li>
      </ul>
    </section>
  );
}
