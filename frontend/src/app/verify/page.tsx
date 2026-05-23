"use client";

/**
 * 공인중개사 인증 신청 페이지 — 사업자등록 검증 + 자격증 서류 업로드
 * 미제출: 폼 표시 / 제출 완료: 상태 표시
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { submitVerification, getVerificationStatus, uploadLicenseDoc } from "@/lib/api";
import { useAdminToken } from "@/hooks/useAdminToken";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "심사 대기 중", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "승인 완료", color: "bg-green-100 text-green-700" },
  rejected: { label: "거부됨", color: "bg-red-100 text-red-700" },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export default function VerifyPage() {
  const getToken = useAdminToken();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ business_number: "", office_name: "", representative_name: "" });
  const [error, setError] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: status, isLoading, isError, refetch } = useQuery({
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
    onSuccess: async () => {
      // 신청 성공 후 자격증 파일이 있으면 자동 업로드
      if (licenseFile) {
        setUploadStatus("uploading");
        try {
          const t = await getToken();
          if (t) await uploadLicenseDoc(t, licenseFile);
          setUploadStatus("done");
        } catch {
          setUploadStatus("error");
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.verification.status() });
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("JPG, PNG, PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("파일 크기가 5MB를 초과합니다.");
      return;
    }
    setError("");
    setLicenseFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("JPG, PNG, PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("파일 크기가 5MB를 초과합니다.");
      return;
    }
    setError("");
    setLicenseFile(file);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const bn = form.business_number.replace(/-/g, "");
    if (!/^\d{10}$/.test(bn)) { setError("사업자등록번호는 10자리 숫자여야 합니다."); return; }
    if (!form.representative_name.trim()) { setError("대표자명을 입력해주세요."); return; }
    mutation.mutate();
  };

  if (isLoading) {
    return <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16"><div className="h-8 bg-gray-200 rounded animate-pulse" /></div>;
  }

  // 상태 조회 실패 — 미제출 폼이 silent 표시되지 않게 차단 (세션 217 ChartAccordion 패턴 답습)
  if (isError) {
    return (
      <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16">
        <h1 className="text-2xl font-bold text-center mb-8">중개사 인증</h1>
        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-4 text-center">
          <p className="text-sm text-gray-700">인증 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
          <button type="button" onClick={() => refetch()} className="w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 이미 제출한 경우 — 상태 표시
  if (status?.submitted) {
    const vs = status.verification_status ?? "pending";
    const style = STATUS_MAP[vs] ?? STATUS_MAP.pending;
    return (
      <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16">
        <h1 className="text-2xl font-bold text-center mb-8">중개사 인증</h1>
        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">인증 상태</span>
            <span className={`text-xs px-2 py-1 rounded ${style.color}`}>{style.label}</span>
          </div>
          {status.business_verified && <p className="text-xs text-green-600">사업자등록 확인됨</p>}
          {status.license_doc_uploaded && <p className="text-xs text-green-600">자격증 서류 제출됨</p>}
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
      <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">{result.auto_approved ? "인증 완료" : "신청 접수됨"}</h1>
        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-3">
          <p className={`text-sm ${result.business_verified ? "text-green-600" : "text-yellow-600"}`}>
            {result.business_message}
          </p>
          {uploadStatus === "done" && <p className="text-sm text-green-600">자격증 서류가 업로드되었습니다.</p>}
          {uploadStatus === "error" && <p className="text-sm text-red-600">자격증 서류 업로드에 실패했습니다. 재신청 시 다시 시도해주세요.</p>}
          {uploadStatus === "uploading" && <p className="text-sm text-gray-500">자격증 서류 업로드 중...</p>}
          {result.auto_approved
            ? <p className="text-sm text-gray-600">전문가(Expert) 권한이 부여되었습니다.</p>
            : <p className="text-sm text-gray-600">관리자 심사 후 승인될 예정입니다.</p>}
          <Link href="/" className="block text-blue-600 hover:underline text-sm">홈으로 이동</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md sm:max-w-lg mx-auto px-3 sm:px-4 py-8 sm:py-16">
      <h1 className="text-2xl font-bold text-center mb-8">중개사 인증 신청</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-4">
        <p className="text-sm text-gray-600">사업자 정보를 입력하면 자동 검증을 진행합니다. 자격증 서류를 첨부하면 관리자가 확인합니다.</p>
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

        {/* 자격증 서류 업로드 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">공인중개사 자격증 (선택)</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
          >
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange} className="hidden" />
            {licenseFile ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-sm text-gray-700">{licenseFile.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); setLicenseFile(null); }} className="text-xs text-red-500 hover:text-red-700 ml-2">제거</button>
              </div>
            ) : (
              <div className="space-y-1">
                <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5" /></svg>
                <p className="text-sm text-gray-500">클릭 또는 드래그하여 파일 업로드</p>
                <p className="text-xs text-gray-400">JPG, PNG, PDF (최대 5MB)</p>
              </div>
            )}
          </div>
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
