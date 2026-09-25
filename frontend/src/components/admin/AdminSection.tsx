"use client";

/**
 * 대시보드 3층 "원인" 절 — 기본 접힘, 펼쳤을 때만 안쪽 카드를 그린다.
 *
 * - 접힌 동안 children 을 렌더하지 않으므로 안쪽 카드의 API 호출도 0 이다
 *   (대시보드 첫 화면이 가벼워지고, 시각 회귀 촬영 높이도 흔들리지 않는다).
 * - 주소 끝이 `#<id>` 이면 자동으로 펼친다 — 마운트 시 한 번 + `hashchange` 때마다.
 *   건강 요약 줄처럼 "원인 보러 가기" 링크가 이 절을 열면서 스크롤하게 하려는 것.
 */

import { useEffect, useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** 제목 오른쪽 작은 빨간 칩(예: "3건") — 접힌 채로도 보인다. 없거나 빈 문자열이면 안 그린다 */
  badge?: string;
  children: ReactNode;
}

/**
 * 다른 카드에서 "이 절을 열고 그리로 가기" — 주소 끝을 `#<id>` 로 바꿔 절을 연다.
 * 이미 같은 주소라 hashchange 가 안 나는 경우(한 번 열었다 접은 뒤)에도 열리도록 직접 알린다.
 */
export function openAdminSection(id: string) {
  if (window.location.hash === `#${id}`) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = id;
  }
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function AdminSection({ id, title, defaultOpen = false, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [id]);

  return (
    <details
      id={id}
      open={open}
      className="bg-white border rounded-lg scroll-mt-20"
    >
      {/* 열림 상태는 React 가 쥔다 — 브라우저 기본 토글을 막고 상태로만 바꾼다
          (키보드 Enter·Space 도 summary 의 click 으로 들어온다) */}
      <summary
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg list-none [&::-webkit-details-marker]:hidden"
      >
        <span className="flex items-center gap-2 min-w-0">
          {/* break-keep — 휴대폰 폭에서 줄이 바뀌어도 낱말 가운데서 끊지 않는다 */}
          <span className="min-w-0 break-keep">{title}</span>
          {badge && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
              {badge}
            </span>
          )}
        </span>
        <span className="text-xs font-normal text-gray-500 shrink-0">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </summary>
      {open && <div className="px-2 pb-2">{children}</div>}
    </details>
  );
}
