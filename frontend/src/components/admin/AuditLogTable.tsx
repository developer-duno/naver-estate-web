"use client";

import type { AuditLog } from "@/types/admin";
import { getActionLabel, getTargetLabel, getDetailsSummary } from "@/lib/admin-labels";
import { useAdminUserMap, formatUserDisplay } from "@/hooks/useAdminUserMap";

interface Props {
  logs: AuditLog[];
  token: string;
}

export default function AuditLogTable({ logs, token }: Props) {
  const { userMap } = useAdminUserMap(token);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3">시각</th>
            <th className="py-2 pr-3">사용자</th>
            <th className="py-2 pr-3">액션</th>
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
              <td className="py-2 pr-3 text-xs text-gray-600 max-w-45 truncate" title={l.user_id || ""}>
                {formatUserDisplay(l.user_id, userMap)}
              </td>
              <td className="py-2 pr-3">
                <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded" title={l.action}>
                  {getActionLabel(l.action)}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs text-gray-700" title={l.target_type ? `${l.target_type}:${l.target_id || ""}` : ""}>
                {getTargetLabel(l.target_type, l.target_id)}
              </td>
              <td className="py-2 text-xs text-gray-500 max-w-70 truncate" title={l.details ? JSON.stringify(l.details) : ""}>
                {getDetailsSummary(l.action, l.details)}
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
