"use client";

import type { ReactNode } from "react";

interface AdminCardProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

/** 관리자 화면의 헤더+본문 카드 공통 래퍼 (bg-white border rounded-lg p-4) */
export default function AdminCard({ title, children, action }: AdminCardProps) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
