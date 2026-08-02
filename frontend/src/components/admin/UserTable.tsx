"use client";

import { useState, useEffect, useRef } from "react";
import type { UserProfile, UserUpdatePayload } from "@/types/admin";

interface Props {
  users: UserProfile[];
  onUpdate: (userId: string, payload: UserUpdatePayload) => Promise<void>;
}

const ROLE_OPTIONS = ["user", "expert", "admin"] as const;
const STATUS_OPTIONS = ["approved", "pending", "suspended", "rejected"] as const;

const ROLE_LABELS: Record<string, string> = { user: "일반", expert: "전문가", admin: "관리자" };
const STATUS_LABELS: Record<string, string> = { approved: "승인", pending: "대기", suspended: "정지", rejected: "거부" };
const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
  rejected: "bg-gray-100 text-gray-700",
};

const PERIOD_PRESETS = [
  { label: "1개월", months: 1 },
  { label: "3개월", months: 3 },
  { label: "6개월", months: 6 },
  { label: "1년", months: 12 },
  { label: "무기한", months: 0 },
];

function getRemainingDays(approvedUntil?: string | null): string {
  if (!approvedUntil) return "무기한";
  const expiry = new Date(approvedUntil);
  const now = new Date();
  const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "만료";
  if (diff === 0) return "오늘 만료";
  return `${diff}일 남음`;
}

function isExpired(approvedUntil?: string | null): boolean {
  if (!approvedUntil) return false;
  return new Date(approvedUntil) < new Date();
}

/** ESC 닫기 + Tab 포커스 트랩 — ArticleDetail.tsx/PromptModal.tsx 답습 */
function useDialogA11y(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    el.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); prevFocus?.focus(); };
  }, [open, onClose]);

  return dialogRef;
}

export default function UserTable({ users, onUpdate }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<string | null>(null);
  const approvalDialogRef = useDialogA11y(approvalModal !== null, () => setApprovalModal(null));

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdating(userId);
    try {
      await onUpdate(userId, { role: role as UserUpdatePayload["role"] });
    } finally {
      setUpdating(null);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    if (newStatus === "approved") {
      setApprovalModal(userId);
      return;
    }
    setUpdating(userId);
    try {
      await onUpdate(userId, { status: newStatus as UserUpdatePayload["status"] });
    } finally {
      setUpdating(null);
    }
  };

  const handleApprove = async (userId: string, months: number) => {
    setApprovalModal(null);
    setUpdating(userId);
    try {
      let approvedUntil: string | null = null;
      if (months > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        approvedUntil = d.toISOString();
      }
      await onUpdate(userId, { status: "approved", approved_until: approvedUntil });
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
            <th className="py-2 pr-4">승인 기간</th>
            <th className="py-2 pr-4">로그인</th>
            <th className="py-2 pr-4">마케팅</th>
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
              <td className="py-2 pr-4">
                {u.status === "approved" ? (
                  <span className={`text-xs ${isExpired(u.approved_until) ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                    {getRemainingDays(u.approved_until)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </td>
              <td className="py-2 pr-4 text-xs text-gray-500">{u.login_count}회</td>
              <td className="py-2 pr-4 text-xs">
                {u.agree_marketing ? (
                  <span className="text-green-700">동의</span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              <td className="py-2 text-xs text-gray-500">
                {u.created_at ? new Date(u.created_at).toLocaleDateString("ko") : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 승인 기간 선택 모달 */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setApprovalModal(null)}>
          <div
            ref={approvalDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="승인 기간 선택"
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">승인 기간 선택</h3>
            <div className="grid grid-cols-2 gap-2">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleApprove(approvalModal, p.months)}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-blue-50 hover:border-blue-400 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setApprovalModal(null)}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
