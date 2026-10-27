"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Complex } from "@/types";
import ComplexHeader, { FavoriteCompareButtons, type FavoriteCompareProps } from "@/components/complex/ComplexHeader";
import { formatKoreanPrice } from "@/lib/format";
import { priceRangeText } from "./consumer-format";

interface Props {
  complex: Complex;
  starred: boolean;
  onBack: () => void;
  onToggleFavorite: () => void;
  isCompared: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  /** 한 줄 요약 — null 이면 생략(오피스텔 등) */
  summary: ConsumerSummary | null;
}

/**
 * 머리 요약(보완 F2·A-5) — 대출 카드와 같은 집값 단계. range = 6개월(또는 2년) 범위 + 가진 집 기준 한도(선순위 0),
 * manual = 최근 2년 기록이 없어 한도 숫자는 생략. zoneUnknown 이면 끝에 "(규제지역이면 더 낮아요)".
 */
export type ConsumerSummary =
  | { kind: "range"; area: number | null; period: "6m" | "2y"; min: number; max: number; ltv: number; zoneUnknown: boolean }
  | { kind: "manual" };

function SummaryLine({ s }: { s: ConsumerSummary }) {
  if (s.kind === "manual") {
    return <>최근 2년 정부 실거래 기록 없음 · 담보대출 한도는 아래 4번에서 집값을 넣어 계산해요</>;
  }
  return (
    <>
      {s.area != null ? `${s.area}㎡ 기준 ` : ""}최근 {s.period === "2y" ? "2년 " : ""}거래{" "}
      <b className="text-gray-900">{priceRangeText(s.min, s.max)}</b>
      {" · "}담보대출 한도 최대 약 <b className="text-blue-700">{formatKoreanPrice(s.ltv)}</b>
      <span className="text-xs text-gray-500"> (가진 집 담보 · 선순위 없을 때 · 참고)</span>
      {s.zoneUnknown && <span className="text-xs text-gray-500"> (규제지역이면 더 낮아요)</span>}
    </>
  );
}

/** 서버 h1 옆 자리 id — app/complex/[no]/page.tsx 가 h1 옆에 둔다 */
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
  const buttons = <FavoriteCompareButtons {...props} />;
  return slot ? createPortal(buttons, slot) : buttons;
}

/** S0 머리 — 뒤로·유형 배지 + 주소 칩 + 한 줄 요약(세션 482 PR 1b). ★·비교는 서버 h1 옆으로(세션 483 PR 3b) */
export default function ConsumerHeader({ complex, summary, ...header }: Props) {
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
            <li key={c} className="text-xs text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5">{c}</li>
          ))}
        </ul>
      )}
      {summary && (
        <p className="text-sm text-gray-600" data-testid="consumer-summary">
          <SummaryLine s={summary} />
        </p>
      )}
    </div>
  );
}
