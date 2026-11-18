import type { ReactNode } from "react";

interface Props {
  /** h1 위 작은 줄 — 빵부스러기·분류 이름 등(주황 글자가 기본) */
  eyebrow?: ReactNode;
  /** h1 글자 — 장마다 h1 은 이것 하나 */
  title: ReactNode;
  /** h1 아래 설명 한 줄(옅은 글자) */
  description?: ReactNode;
  /** 설명 아래 단추 자리 */
  actions?: ReactNode;
  /** 아래 첫 카드가 띠에 걸칠 때(바깥에서 -mt-16) — 아래 여백을 넓혀 띠 글자를 가리지 않게 */
  overlap?: boolean;
  /** 안쪽 폭 클래스 — 기본 = 홈과 같은 1160 · 단지 장은 본문과 같은 max-w-7xl px-4 를 준다 */
  innerClassName?: string;
}

export const PAGE_BAND_INNER_DEFAULT = "mx-auto max-w-[1160px] px-4 sm:px-6";

/**
 * 안쪽 화면 머리 남색 띠(세션 524 B40 PR 1 · 홈 HomeHero 와 같은 색·글자 틀) — 훅이 없어 서버가 첫 HTML 에 그린다.
 * 홈 부품은 손대지 않고 따로 둔다(홈 기준 그림 변화 0).
 */
export default function PageBand({ eyebrow, title, description, actions, overlap = false, innerClassName = PAGE_BAND_INNER_DEFAULT }: Props) {
  return (
    <div className="bg-brand-navy text-white" data-testid="page-band">
      <div className={`${innerClassName} pt-5 sm:pt-8 ${overlap ? "pb-[88px] sm:pb-[96px]" : "pb-6 sm:pb-8"}`}>
        {eyebrow && <div className="text-[13px] font-bold text-brand-orange sm:text-sm">{eyebrow}</div>}
        <h1 className="mt-1.5 text-[26px] font-black leading-tight tracking-tight sm:mt-2 sm:text-[36px]">{title}</h1>
        {description && <p className="mt-2 text-sm text-brand-on-navy-muted sm:text-[15px]">{description}</p>}
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </div>
  );
}
