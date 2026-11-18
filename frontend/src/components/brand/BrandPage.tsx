import type { ReactNode } from "react";

/** 새 틀 장 바탕(세션 524 B40 PR 1 · 홈 app/page.tsx 와 같음) — 옅은 회청 바탕이 바닥글 위 여백(mt-16)까지 이어지게 -mb-16 pb-16 */
export default function BrandPage({ children }: { children: ReactNode }) {
  return <div className="-mb-16 bg-brand-bg pb-16" data-testid="brand-page">{children}</div>;
}
