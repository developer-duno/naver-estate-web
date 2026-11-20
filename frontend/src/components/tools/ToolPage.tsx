import type { ReactNode } from "react";
import BrandPage from "@/components/brand/BrandPage";
import PageBand from "@/components/brand/PageBand";

/** 계산기 장 안쪽 폭 — 옛 틀과 같은 max-w-3xl(데스크톱 배치 변화 최소 · 설계 T1) */
export const TOOL_PAGE_INNER = "mx-auto max-w-3xl px-4 sm:px-6";

interface Props {
  /** h1 위 작은 줄(주황) */
  eyebrow?: ReactNode;
  /** h1 글자 — 장마다 h1 은 이것 하나 */
  title: ReactNode;
  /** h1 아래 설명 한 줄 */
  description?: ReactNode;
  /** 바닥 링크 줄(ToolLinks) — 안 주면 아무것도 안 그린다(계산기 모음 장) */
  links?: ReactNode;
  /** 첫 카드가 띠에 걸친다(-mt-16) */
  children: ReactNode;
}

/**
 * 계산기 새 틀 뼈대(세션 530 · B40 PR 3a · 설계 T1) — 남색 띠 + 띠에 걸치는 카드 + 바닥 링크.
 * 훅이 없어 서버가 첫 HTML 에 그린다(h1·설명·링크가 검색엔진에 그대로 보인다).
 */
export default function ToolPage({ eyebrow, title, description, links, children }: Props) {
  return (
    <BrandPage>
      <PageBand overlap innerClassName={TOOL_PAGE_INNER} eyebrow={eyebrow} title={title} description={description} />
      <div className={`${TOOL_PAGE_INNER} pb-6`}>
        <div className="-mt-16">{children}</div>
        {links}
      </div>
    </BrandPage>
  );
}
