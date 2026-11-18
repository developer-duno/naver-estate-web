import type { ComponentProps } from "react";

export const BRAND_CARD_CLASS = "rounded-2xl bg-white shadow-[0_8px_24px_rgba(11,31,58,0.14)]";

type Props = ComponentProps<"div"> & { as?: "div" | "section" };

/** 새 틀 흰 카드(세션 524 B40 PR 1 · 홈 대출 판과 같은 모서리·그림자) — 안쪽 여백은 쓰는 쪽이 className 으로 */
export default function BrandCard({ as: Tag = "div", className = "", ...props }: Props) {
  return <Tag className={`${BRAND_CARD_CLASS}${className ? ` ${className}` : ""}`} {...props} />;
}
