"use client";

/** 관리자 검증 심사 — 대기 중인 검증 신청 목록 + 승인/거부 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminVerifications, approveVerification, rejectVerification } from "@/lib/api";
import type { AgentVerification } from "@/types/admin";
import AdminCard from "./AdminCard";

interface Props {
  token: string;
}

/** ESC 닫기 + Tab 포커스 트랩 — ArticleDetail.tsx/PromptModal.tsx 답습 (본 파일 모달 2개 공용) */
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

export default function VerificationReview({ token }: Props) {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewDialogRef = useDialogA11y(previewUrl !== null, () => setPreviewUrl(null));
  const rejectDialogRef = useDialogA11y(rejectId !== null, () => setRejectId(null));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.verifications({ status: "pending" }),
    queryFn: () => getAdminVerifications(token, { status: "pending" }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => approveVerification(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, r }: { id: number; r: string }) => rejectVerification(token, id, r),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] }); setRejectId(null); setReason(""); },
  });

  if (isLoading) return <div className="h-8 bg-gray-100 rounded animate-pulse" />;

  const items: AgentVerification[] = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <AdminCard title={`검증 심사 대기 (${data?.total ?? 0}건)`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-3">이메일</th>
              <th className="pb-2 pr-3">사업자번호</th>
              <th className="pb-2 pr-3">대표자</th>
              <th className="pb-2 pr-3">사업자 검증</th>
              <th className="pb-2 pr-3">중개사 검증</th>
              <th className="pb-2 pr-3">자격증 서류</th>
              <th className="pb-2 pr-3">신청일</th>
              <th className="pb-2">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3 text-gray-700">{v.email}</td>
                <td className="py-2 pr-3 text-gray-600">{v.business_number}</td>
                <td className="py-2 pr-3 text-gray-600">{v.representative_name}</td>
                <td className="py-2 pr-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${v.business_verified ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {v.business_verified ? "확인됨" : "미확인"}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {v.broker_verified ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                      title={v.broker_jurirno ? `등록번호 ${v.broker_jurirno}` : undefined}>
                      국토부 확인됨
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {v.broker_status ?? "미확인"}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {v.license_doc_url ? (
                    <button onClick={() => setPreviewUrl(v.license_doc_url!)}
                      className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">
                      보기
                    </button>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">미제출</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-gray-500">
                  {v.submitted_at ? new Date(v.submitted_at).toLocaleDateString("ko") : "-"}
                </td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={() => approveMut.mutate(v.id)} disabled={approveMut.isPending}
                      className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                      승인
                    </button>
                    <button onClick={() => setRejectId(v.id)} disabled={rejectMut.isPending}
                      className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50">
                      거부
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 자격증 서류 미리보기 모달 */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewUrl(null)}>
          <div
            ref={previewDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="자격증 서류"
            className="bg-white rounded-lg shadow-xl p-4 max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">자격증 서류</h3>
              <button onClick={() => setPreviewUrl(null)} aria-label="닫기" className="text-gray-400 hover:text-gray-600 text-xl min-h-[44px] min-w-[44px]">&times;</button>
            </div>
            {previewUrl.includes(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[70vh] border rounded" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="자격증 서류" className="w-full rounded" />
            )}
            <a href={previewUrl} target="_blank" rel="noopener noreferrer"
              className="block text-center text-sm text-blue-600 hover:underline mt-3">
              새 탭에서 열기
            </a>
          </div>
        </div>
      )}

      {/* 거부 사유 입력 모달 */}
      {rejectId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRejectId(null)}>
          <div
            ref={rejectDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="거부 사유 입력"
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">거부 사유 입력</h3>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="거부 사유를 입력해주세요" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { if (reason.trim()) rejectMut.mutate({ id: rejectId, r: reason }); }}
                disabled={!reason.trim() || rejectMut.isPending}
                className="flex-1 bg-red-600 text-white py-1.5 rounded-md text-sm disabled:opacity-50">거부</button>
              <button onClick={() => setRejectId(null)}
                className="flex-1 border py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-50">취소</button>
            </div>
          </div>
        </div>
      )}
    </AdminCard>
  );
}
