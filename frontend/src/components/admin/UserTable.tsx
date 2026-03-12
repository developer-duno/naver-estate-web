"use client";

import { useState } from "react";
import type { UserProfile, UserUpdatePayload } from "@/types/admin";

interface Props {
  users: UserProfile[];
  onUpdate: (userId: string, payload: UserUpdatePayload) => Promise<void>;
  onSuspend: (userId: string) => Promise<void>;
}

const ROLE_OPTIONS = ["user", "expert", "admin"] as const;
const STATUS_OPTIONS = ["approved", "pending", "suspended"] as const;

const ROLE_LABELS: Record<string, string> = { user: "일반", expert: "전문가", admin: "관리자" };
const STATUS_LABELS: Record<string, string> = { approved: "승인", pending: "대기", suspended: "정지", rejected: "거부" };
const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
  rejected: "bg-gray-100 text-gray-700",
};

export default function UserTable({ users, onUpdate, onSuspend }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdating(userId);
    try {
      await onUpdate(userId, { role: role as UserUpdatePayload["role"] });
    } finally {
      setUpdating(null);
    }
  };

  const handleStatusChange = async (userId: string, status: string) => {
    setUpdating(userId);
    try {
      await onUpdate(userId, { status: status as UserUpdatePayload["status"] });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-4">이메일</th>
            <th className="py-2 pr-4">역할</th>
            <th className="py-2 pr-4">상태</th>
            <th className="py-2 pr-4">로그인</th>
            <th className="py-2">가입일</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} className="border-b hover:bg-gray-50">
              <td className="py-2 pr-4 text-gray-700">{u.email}</td>
              <td className="py-2 pr-4">
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                  disabled={updating === u.user_id}
                  className="text-xs border rounded px-1.5 py-0.5"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-4">
                <select
                  value={u.status}
                  onChange={(e) => handleStatusChange(u.user_id, e.target.value)}
                  disabled={updating === u.user_id}
                  className={`text-xs border rounded px-1.5 py-0.5 ${STATUS_COLORS[u.status] || ""}`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-4 text-xs text-gray-500">{u.login_count}회</td>
              <td className="py-2 text-xs text-gray-500">
                {u.created_at ? new Date(u.created_at).toLocaleDateString("ko") : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
