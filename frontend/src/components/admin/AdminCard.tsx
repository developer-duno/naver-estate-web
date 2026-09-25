"use client";

import { useId, useState, type ReactNode } from "react";

interface AdminCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** 카드 제목 옆 ⓘ 버튼을 누르면 펼쳐지는 도움말 (기본 접힘 — 운영 지식이라 지우지 않고 숨겨 둔다) */
  help?: string;
  /**
   * true 면 카드 제목(h3)을 그리지 않는다 — 대시보드 접힌 절(AdminSection) 안처럼 바깥에 이미
   * 같은 제목이 있을 때 "자동 작업 현황 / 자동 작업 현황" 두 줄 중복을 막는다.
   * 도움말(ⓘ)·action 은 그대로 두고, ⓘ 버튼은 카드 첫 줄 오른쪽으로 옮긴다.
   */
  hideTitle?: boolean;
}

/** 관리자 화면의 헤더+본문 카드 공통 래퍼 (bg-white border rounded-lg p-4) */
export default function AdminCard({ title, children, action, help, hideTitle = false }: AdminCardProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();

  const helpButton = help && (
    <button
      type="button"
      onClick={() => setHelpOpen((v) => !v)}
      aria-expanded={helpOpen}
      // 설명 문단은 열렸을 때만 DOM 에 있으므로, 가리킬 대상이 있을 때만 aria-controls 를 단다
      // (닫힌 상태에서 없는 id 를 가리키면 보조기기에 깨진 참조가 된다)
      aria-controls={helpOpen ? helpId : undefined}
      aria-label="설명 보기"
      className={`text-xs leading-none rounded px-0.5 hover:text-gray-600 ${
        helpOpen ? "text-blue-600" : "text-gray-400"
      }`}
    >
      ⓘ
    </button>
  );

  // 조건부 렌더 — 닫혀 있으면 문구가 DOM 에 없다(화면·스크린리더 모두 조용)
  const helpText = help && helpOpen && (
    <p id={helpId} className="mt-1 text-xs text-gray-500 leading-snug">
      {help}
    </p>
  );

  if (hideTitle) {
    return (
      <div className="bg-white border rounded-lg p-4">
        {(helpButton || action) && (
          <div className="mb-3">
            <div className="flex items-start justify-end gap-3">
              {action && <div className="shrink-0">{action}</div>}
              {helpButton}
            </div>
            {helpText}
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0 flex-1">
          {/* 버튼을 h3 밖(형제)에 둔다 — 안에 두면 제목의 접근 이름에 "설명 보기"가 섞인다 */}
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-700">{title}</h3>
            {helpButton}
          </div>
          {helpText}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
