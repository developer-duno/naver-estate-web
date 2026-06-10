"use client";

import type { ReactNode } from "react";

interface AdminCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** 카드 제목 옆 ⓘ 도움말 (hover/tap 시 native title 툴팁) */
  help?: string;
}

/** 관리자 화면의 헤더+본문 카드 공통 래퍼 (bg-white border rounded-lg p-4) */
export default function AdminCard({ title, children, action, help }: AdminCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            {title}
            {help && (
              <span aria-hidden="true" className="text-gray-400 text-xs select-none">
                ⓘ
              </span>
            )}
          </h3>
          {help && (
            <p className="mt-1 text-xs text-gray-500 leading-snug">{help}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
