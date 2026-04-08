"use client";

/**
 * 공인중개사 인증 신청 페이지 — 자격증/사업자등록 검증 폼
 * 미제출: 폼 표시 / 제출 완료: 상태 표시
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { submitVerification, getVerificationStatus } from "@/lib/api";
import { useAdminToken } from "@/hooks/useAdminToken";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "심사 대기 중", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "승인 완료", color: "bg-green-100 text-green-700" },
  rejected: { label: "거부됨", color: "bg-red-100 text-red-700" },
};

export default function VerifyPage() {
  const getToken = useAdminToken();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ license_number: "", business_number: "", office_name: "", representative_name: "" });
  const [error, setError] = useState("");

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.verification.status(),
    queryFn: async () => { const t = await getToken(); return t ? getVerificationStatus(t) : null; },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const t = await getToken();
      if (!t) throw new Error("로그인이 필요합니다");
      return submitVerification(t, form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.verification.status() }),
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const bn = form.business_number.replace(/-/g, "");
    if (!/^\d{10}$/.test(bn)) { setError("사업자등록번호는 10자리 숫자여야 합니다."); return; }
    if (!form.representative_name.trim()) { setError("대표자명을 입력해주세요."); return; }
    mutation.mutate();
  };

  if (isLoading) {
    return <div className="max-w-md mx-auto px-4 py-16"><div className="h-8 bg-gray-200 rounded animate-pulse" /></div>;
  }

  // 이미 제출한 경우 — 상태 표시
  if (status?.submitted) {
    const vs = status.verification_status ?? "pending";
    const style = STATUS_MAP[vs] ?? STATUS_MAP.pending;
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-center mb-8">중개사 인증</h1>
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">인증 상태</span>
            <span className={`text-xs px-2 py-1 rounded ${style.color}`}>{style.label}</span>
          </div>
          {status.business_verified && <p className="text-xs text-green-600">사업자등록 확인됨</p>}
          {vs === "rejected" && status.rejection_reason && (
            <div className="bg-red-50 rounded-md p-3 text-sm text-red-700">
              <p className="font-medium mb-1">거부 사유</p>
              <p>{status.rejection_reason}</p>
            </div>
          )}
          {vs === "rejected" && (
            <button onClick={() => queryClient.setQueryData(queryKeys.verification.status(), { submitted: false })}
              className="w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700">
              재신청하기
            </button>
          )}
          {vs === "pending" && <p className="text-xs text-gray-500">관리자 심사 후 결과를 안내드립니다.</p>}
          {vs === "approved" && (
            <Link href="/" className="block text-center text-sm text-blue-600 hover:underline">홈으로 이동</Link>
          )}
        </div>
      </div>
    );
  }

  // 미제출 — 신청 폼
  const result = mutation.data;
  if (result) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">{result.auto_approved ? "인증 완료" : "신청 접수됨"}</h1>
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-3">
          <p className={`text-sm ${result.business_verified ? "text-green-600" : "text-yellow-600"}`}>
            {result.business_message}
          </p>
          {result.license_message && (
            <p className={`text-sm ${result.license_verified ? "text-green-600" : "text-yellow-600"}`}>
              {result.license_message}
            </p>
          )}
          {result.auto_approved
            ? <p className="text-sm text-gray-600">전문가(Expert) 권한이 부여되었습니다.</p>
            : <p className="text-sm text-gray-600">관리자 심사 후 승인될 예정입니다.</p>}
          <Link href="/" className="block text-blue-600 hover:underline text-sm">홈으로 이동</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-8">중개사 인증 신청</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
        <p className="text-sm text-gray-600">공인중개사 자격 및 사업자 정보를 입력하면 자동 검증을 진행합니다.</p>
        {error && <div role="alert" className="bg-red-50 text-red-600 text-sm rounded-md px-3 py-2">{error}</div>}

        <div>
          <label htmlFor="v-biz" className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호 *</label>
          <input id="v-biz" type="text" value={form.business_number}
            onChange={(e) => setForm((f) => ({ ...f, business_number: e.target.value }))}
            required maxLength={12} placeholder="000-00-00000" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="v-name" className="block text-sm font-medium text-gray-700 mb-1">대표자명 *</label>
          <input id="v-name" type="text" value={form.representative_name}
            onChange={(e) => setForm((f) => ({ ...f, representative_name: e.target.value }))}
            required maxLength={50} placeholder="홍길동" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="v-license" className="block text-sm font-medium text-gray-700 mb-1">공인중개사 자격증번호</label>
          <input id="v-license" type="text" value={form.license_number}
            onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
            disabled={!status?.license_verification_available}
            maxLength={30} placeholder={status?.license_verification_available ? "선택 입력" : "서비스 준비 중"}
            className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500${!status?.license_verification_available ? " bg-gray-50 text-gray-400 cursor-not-allowed" : ""}`} />
          {!status?.license_verification_available && (
            <p className="text-xs text-gray-400 mt-1">자격증 검증 서비스 준비 중입니다.</p>
          )}
        </div>
        <div>
          <label htmlFor="v-office" className="block text-sm font-medium text-gray-700 mb-1">중개사무소명</label>
          <input id="v-office" type="text" value={form.office_name}
            onChange={(e) => setForm((f) => ({ ...f, office_name: e.target.value }))}
            maxLength={100} placeholder="선택 입력" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <button type="submit" disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300">
          {mutation.isPending ? "검증 중..." : "인증 신청"}
        </button>
      </form>
    </div>
  );
}
