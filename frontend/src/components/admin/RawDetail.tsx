"use client";

/**
 * 관리자 화면의 "원문 보기" — 누르면 개발자 원문(작업 코드·오류 원문·주소 경로 등)이 펼쳐진다.
 *
 * 옛 방식은 원문을 `title` 속성에만 넣어 마우스를 올려야 보였다. 휴대폰에는 마우스가 없어
 * 원문을 볼 길이 없었다(사장님 "폰도 쓴다", 2026-09-26). 이제 눌러서 펼친다.
 *
 * 두 가지 모양:
 * - children 없음 → 작은 "원문 보기" 글자를 보여 주고, 누르면 원문. 마우스를 올리면 예전처럼
 *   `title` 로도 미리 보인다(데스크톱).
 * - children 있음 → 지금 보이는 글자(우리말 이름 등)를 **그대로** 누를 거리로 쓴다. 접힌 동안
 *   화면 모양이 바뀌지 않으므로 대시보드처럼 시각 회귀 사진이 있는 자리에 쓴다. 이때 `title` 은
 *   children 쪽이 이미 들고 있으므로 여기서는 달지 않는다.
 *
 * 원문이 비어 있으면 누를 거리 없이 children 만(없으면 아무것도) 그린다.
 * 열림 상태는 React 가 쥐고, 펼쳤을 때만 원문을 DOM 에 넣는다(AdminSection 과 같은 방식).
 * 누름은 바깥으로 올려 보내지 않는다 — 행 전체를 누르면 펼쳐지는 표(SchedulerMonitor) 안에서도
 * 원문만 따로 열고 닫게.
 */

import { useState, type ReactNode } from "react";

interface Props {
  /** 펼쳤을 때 보일 원문 */
  raw?: string | null;
  /** 접힌 채 보이는 것 — 없으면 "원문 보기" */
  children?: ReactNode;
  /** details 요소에 붙일 클래스 (배치용) */
  className?: string;
  /** summary 요소에 붙일 클래스 (예: 칸 폭을 넘으면 말줄임) */
  summaryClassName?: string;
}

export default function RawDetail({ raw, children, className = "", summaryClassName = "" }: Props) {
  const [open, setOpen] = useState(false);

  if (!raw) return <>{children ?? null}</>;

  const plainLabel = children === undefined;

  return (
    <details open={open} className={className}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={plainLabel ? raw : undefined}
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}
      >
        {plainLabel ? (
          <span className="text-[11px] text-blue-700 underline decoration-dotted underline-offset-2">
            {open ? "원문 접기" : "원문 보기"}
          </span>
        ) : (
          children
        )}
      </summary>
      {open && (
        <code className="mt-1 block max-w-full whitespace-pre-wrap break-all rounded bg-gray-100 px-1.5 py-1 font-mono text-[11px] leading-snug text-gray-700">
          {raw}
        </code>
      )}
    </details>
  );
}
