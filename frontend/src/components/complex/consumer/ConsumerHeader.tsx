"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Complex } from "@/types";
import ComplexHeader, { FavoriteCompareButtons, type FavoriteCompareProps } from "@/components/complex/ComplexHeader";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
}

/** 서버 단추 자리 id — app/complex/[no]/page.tsx 가 남색 띠 안(h1·사실 줄 아래)에 둔다 */
export const TITLE_ACTIONS_ID = "complex-title-actions";

/**
 * ★·비교 버튼을 서버 h1 옆(같은 줄, 승인 그림 A안)으로 보낸다 — h1 은 서버 것 하나 그대로, 버튼만 클라이언트 섬.
 * 자리가 없으면(시험·서버 껍데기 밖) 이 자리에 그대로 그린다. 첫 그림 전엔 아무것도 안 그린다(자리 이동 깜빡임 방지).
 */
function TitleActions(props: FavoriteCompareProps) {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => {
    setSlot(document.getElementById(TITLE_ACTIONS_ID)); // eslint-disable-line react-hooks/set-state-in-effect -- 마운트 뒤 자리 찾기
  }, []);
  if (slot === undefined) return null;
  // 서버 h1 옆 자리는 남색 띠 안 — 그 자리로 갈 때만 띠 단추 모양(세션 524 B40 PR 1)
  return slot ? createPortal(<FavoriteCompareButtons {...props} tone="navy" />, slot) : <FavoriteCompareButtons {...props} />;
}

/**
 * S0 머리 — 뒤로·유형 배지 + 주소 칩(세션 482 PR 1b). ★·비교는 서버 h1 옆으로(세션 483 PR 3b).
 * 한 줄 요약(범위·한도)은 세션 524 B40 PR 1 에 뺐다 — 범위는 '한눈에 보기' 큰 줄, 한도는 대출 판 큰 줄이 같은 숫자를 보인다.
 */
export default function ConsumerHeader({ complex, ...header }: Props) {
  // 사용승인·세대수·동수는 '한눈에 보기' 표에 있어 머리 칩에서 뺀다(두 번 나오지 않게 — 맹점🟠4⑤). 주소만 남긴다
  const chips: string[] = [];
  const addr = complex.address || complex.cortar_address;
  if (addr) chips.push(addr);

  return (
    <div className="space-y-2">
      <TitleActions
        name={complex.complex_name}
        starred={header.starred}
        onToggleFavorite={header.onToggleFavorite}
        isCompared={header.isCompared}
        compareFull={header.compareFull}
        onToggleCompare={header.onToggleCompare}
      />
      {/* 이름은 서버 h1 이 바로 위에 있어 뺀다 · ★·비교는 h1 옆으로 — 이 줄은 뒤로·유형 배지만(세션 483 PR 3b) */}
      <ComplexHeader complex={complex} showName={false} showActions={false} {...header} />
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="단지 기본 사실">
          {chips.map((c) => (
            <li key={c} className="text-xs text-brand-muted bg-white rounded-full px-2.5 py-0.5">{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
