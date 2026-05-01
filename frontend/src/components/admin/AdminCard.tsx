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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          {title}
          {help && (
            <span
              role="img"
              aria-label={help}
              title={help}
              className="text-gray-400 text-xs cursor-help select-none"
            >
              ⓘ
            </span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
