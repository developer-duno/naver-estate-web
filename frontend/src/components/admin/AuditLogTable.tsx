"use client";

import type { AuditLog } from "@/types/admin";
import { getActionLabel, getTargetLabel, getDetailsSummary } from "@/lib/admin-labels";
import { useAdminUserMap, formatUserDisplay } from "@/hooks/useAdminUserMap";
import RawDetail from "./RawDetail";

interface Props {
  logs: AuditLog[];
  token: string;
}

export default function AuditLogTable({ logs, token }: Props) {
  const { userMap } = useAdminUserMap(token);

  return (
    <div className="overflow-x-auto">
      {/* 5열 — 휴대폰에서 칸이 눌리지 않게 최소 폭을 두고 가로로 넘긴다.
          칸의 원래 기록(영문)은 마우스를 올리거나(데스크톱) 칸 글자를 누르면(휴대폰) 보인다 */}
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3">시각</th>
            <th className="py-2 pr-3">사용자</th>
            <th className="py-2 pr-3">한 일</th>
            <th className="py-2 pr-3">대상</th>
            <th className="py-2">상세</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b hover:bg-gray-50">
              <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                {l.created_at ? new Date(l.created_at).toLocaleString("ko") : "-"}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-600 max-w-45" title={l.user_id || ""}>
                <RawDetail raw={l.user_id}>
                  <span className="block truncate">{formatUserDisplay(l.user_id, userMap)}</span>
                </RawDetail>
              </td>
              <td className="py-2 pr-3">
                <RawDetail raw={l.action}>
                  <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded" title={l.action}>
                    {getActionLabel(l.action)}
                  </span>
                </RawDetail>
              </td>
              <td className="py-2 pr-3 text-xs text-gray-700" title={l.target_type ? `${l.target_type}:${l.target_id || ""}` : ""}>
                <RawDetail raw={l.target_type ? `${l.target_type}:${l.target_id || ""}` : ""}>
                  <span>{getTargetLabel(l.target_type, l.target_id)}</span>
                </RawDetail>
              </td>
              <td className="py-2 text-xs text-gray-500 max-w-70" title={l.details ? JSON.stringify(l.details) : ""}>
                <RawDetail raw={l.details ? JSON.stringify(l.details) : ""}>
                  <span className="block truncate">{getDetailsSummary(l.action, l.details)}</span>
                </RawDetail>
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-gray-500">로그가 없습니다</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
