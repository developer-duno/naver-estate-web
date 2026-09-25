"use client";

import { useId, useState, type ReactNode } from "react";

interface AdminCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** 카드 제목 옆 ⓘ 버튼을 누르면 펼쳐지는 도움말 (기본 접힘 — 운영 지식이라 지우지 않고 숨겨 둔다) */
  help?: string;
}

/** 관리자 화면의 헤더+본문 카드 공통 래퍼 (bg-white border rounded-lg p-4) */
export default function AdminCard({ title, children, action, help }: AdminCardProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0 flex-1">
          {/* 버튼을 h3 밖(형제)에 둔다 — 안에 두면 제목의 접근 이름에 "설명 보기"가 섞인다 */}
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-700">{title}</h3>
            {help && (
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                aria-expanded={helpOpen}
                aria-controls={helpId}
                aria-label="설명 보기"
                className={`text-xs leading-none rounded px-0.5 hover:text-gray-600 ${
                  helpOpen ? "text-blue-600" : "text-gray-400"
                }`}
              >
                ⓘ
              </button>
            )}
          </div>
          {/* 조건부 렌더 — 닫혀 있으면 문구가 DOM 에 없다(화면·스크린리더 모두 조용) */}
          {help && helpOpen && (
            <p id={helpId} className="mt-1 text-xs text-gray-500 leading-snug">
              {help}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
