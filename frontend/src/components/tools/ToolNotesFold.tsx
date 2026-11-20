import type { ReactNode } from "react";
import { BRAND_CARD_CLASS } from "@/components/brand/BrandCard";

/**
 * 「계산 기준과 주의할 점 (N)」 접는 칸(세션 530 · B40 PR 3a · 설계 T1·T2).
 * - 닫힘이 기본. 닫혀 있어도 안의 글은 첫 HTML 에 그대로 있다(검색엔진·읽기 프로그램이 읽는다).
 * - 위험·경고 안내는 여기에 넣지 않는다 — 결과 바로 아래에 펼쳐 둔다(T2). 여기는 기준·출처·참고 안내만.
 * 훅이 없어 서버·클라이언트 어디서나 쓸 수 있다.
 */
export default function ToolNotesFold({ count, children }: { count: number; children: ReactNode }) {
  return (
    <details className={`group ${BRAND_CARD_CLASS}`} data-testid="tool-notes-fold">
      <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between gap-2 px-4 text-sm font-bold text-brand-navy sm:px-5">
        <span>{`계산 기준과 주의할 점 (${count})`}</span>
        <span aria-hidden className="text-brand-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-2 border-t border-brand-line-soft px-4 py-3 text-sm text-brand-muted sm:px-5">{children}</div>
    </details>
  );
}
