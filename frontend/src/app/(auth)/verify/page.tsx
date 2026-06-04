"use client";

/**
 * 공인중개사 인증 신청 페이지 — 사업자등록 검증 + 자격증 서류 업로드
 * 5 분기: loading / isError / submitted / result / 미제출 폼
 * spec line 363 "검증 단계 가시화" = VerifyProgress 컴포넌트 답습
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckBig, Upload } from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api/core";
import { getVerificationStatus, submitVerification, uploadLicenseDoc } from "@/lib/api";
import { useAdminToken } from "@/hooks/useAdminToken";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { VerifyProgress, type VerifyStep } from "@/components/auth/VerifyProgress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

/** uploadLicenseDoc 의 raw Error · ApiError · TypeError 를 사용자 친화 한국어로 매핑 */
function getUploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.statusCode === 401) return "로그인이 만료되었어요. 다시 로그인해주세요.";
    if (e.statusCode === 413) return "파일 크기가 너무 큽니다. 5MB 이하로 다시 시도해주세요.";
    if (e.statusCode >= 500) return "서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.";
    return e.message;
  }
  if (e instanceof Error) {
    if (e.message.toLowerCase().includes("fetch") || e.message.toLowerCase().includes("network")) {
      return "네트워크 연결이 끊겼어요. 인터넷 상태를 확인해주세요.";
    }
    return e.message; // FastAPI data.detail 한국어 그대로
  }
  return "알 수 없는 오류가 발생했습니다.";
}

export default function VerifyPage() {
  const getToken = useAdminToken();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ business_number: "", office_name: "", representative_name: "" });
  const [error, setError] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
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
      if (licenseFile) {
        setUploadStatus("uploading");
        setUploadError("");
        try {
          const t = await getToken();
          if (t) await uploadLicenseDoc(t, licenseFile);
          setUploadStatus("done");
        } catch (e) {
          console.error("[verify] uploadLicenseDoc failed:", e);
          setUploadStatus("error");
          setUploadError(getUploadErrorMessage(e));
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

  // ── 1 분기: loading ──
  if (isLoading) {
    return (
      <AuthLayout title="중개사 인증" description="인증 상태를 확인하고 있어요" hideBadges>
        <div className="h-8 bg-gray-100 rounded animate-pulse" aria-label="로딩 중" />
      </AuthLayout>
    );
  }

  // ── 2 분기: isError (상태 조회 실패) ──
  if (isError) {
    return (
      <AuthLayout title="중개사 인증" description="상태 조회에 실패했어요">
        <VerifyProgress currentStep="signup" />
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            인증 상태를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          onClick={() => refetch()}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
        >
          다시 시도
        </Button>
      </AuthLayout>
    );
  }

  // ── 3 분기: 이미 제출한 경우 ──
  if (status?.submitted) {
    const vs = status.verification_status ?? "pending";
    const progressStep: VerifyStep = vs === "approved" ? "admin_approve" : "admin_approve";
    return (
      <AuthLayout title="중개사 인증 진행 상태" description="관리자 심사 후 결과를 안내드립니다">
        <VerifyProgress currentStep={progressStep} />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">인증 상태</span>
            {vs === "pending" && (
              <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50">심사 대기 중</Badge>
            )}
            {vs === "approved" && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">승인 완료</Badge>
            )}
            {vs === "rejected" && (
              <Badge variant="destructive">거부됨</Badge>
            )}
          </div>
          {status.business_verified && <p className="text-xs text-accent-green">사업자등록 확인됨</p>}
          {status.license_doc_uploaded && <p className="text-xs text-accent-green">자격증 서류 제출됨</p>}
          {vs === "rejected" && status.rejection_reason && (
            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium mb-1">거부 사유</p>
                <p>{status.rejection_reason}</p>
              </AlertDescription>
            </Alert>
          )}
          {vs === "rejected" && (
            <Button
              onClick={() => queryClient.setQueryData(queryKeys.verification.status(), { submitted: false })}
              className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
            >
              재신청하기
            </Button>
          )}
          {vs === "pending" && (
            <p className="text-xs text-gray-500">관리자 심사 후 결과를 안내드립니다.</p>
          )}
          {vs === "approved" && (
            <Button asChild className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white">
              <Link href="/">홈으로 이동</Link>
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // ── 4 분기: 미제출 → 제출 직후 결과 ──
  const result = mutation.data;
  if (result) {
    const desc = result.business_message + (uploadStatus === "error" ? ` 자격증 업로드 실패: ${uploadError}` : "");
    return (
      <AuthLayout title={result.auto_approved ? "인증 완료" : "신청 접수됨"} hideBadges>
        <VerifyProgress currentStep="admin_approve" />
        <EmptyState
          icon={CircleCheckBig}
          title={result.auto_approved ? "전문가(Expert) 권한이 부여되었어요" : "관리자 심사 후 승인될 예정입니다"}
          description={desc}
          action={
            result.auto_approved ? (
              <Button asChild className="bg-accent-blue hover:bg-accent-blue/90 text-white">
                <Link href="/">홈으로 이동</Link>
              </Button>
            ) : uploadStatus === "error" ? (
              <Button
                onClick={() => { setUploadStatus("idle"); setUploadError(""); }}
                variant="outline"
              >
                다시 업로드
              </Button>
            ) : null
          }
        />
        {uploadStatus === "uploading" && (
          <p className="text-sm text-gray-500 text-center mt-3">자격증 서류 업로드 중...</p>
        )}
        {uploadStatus === "done" && (
          <p className="text-sm text-accent-green text-center mt-3">자격증 서류가 업로드되었어요.</p>
        )}
      </AuthLayout>
    );
  }

  // ── 5 분기: 미제출 폼 ──
  return (
    <AuthLayout
      title="중개사 인증 신청"
      description="사업자 정보 + 자격증 서류로 자동 검증을 진행합니다"
    >
      <VerifyProgress currentStep="license_submit" />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="v-biz">사업자등록번호 *</Label>
          <Input
            id="v-biz"
            type="text"
            value={form.business_number}
            onChange={(e) => setForm((f) => ({ ...f, business_number: e.target.value }))}
            required
            maxLength={12}
            placeholder="000-00-00000"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="v-name">대표자명 *</Label>
          <Input
            id="v-name"
            type="text"
            value={form.representative_name}
            onChange={(e) => setForm((f) => ({ ...f, representative_name: e.target.value }))}
            required
            maxLength={50}
            placeholder="홍길동"
          />
        </div>

        {/* 자격증 서류 업로드 */}
        <div className="space-y-1.5">
          <Label>공인중개사 자격증 (선택)</Label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center cursor-pointer hover:border-accent-blue transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              aria-label="공인중개사 자격증 파일 선택"
              className="hidden"
            />
            {licenseFile ? (
              <div className="flex items-center justify-center gap-2">
                <CircleCheckBig className="w-5 h-5 text-accent-green" aria-hidden="true" />
                <span className="text-sm text-gray-700">{licenseFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLicenseFile(null); }}
                  className="text-xs text-red-500 hover:text-red-700 ml-2"
                >
                  제거
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
                <p className="text-sm text-gray-500">클릭 또는 드래그하여 파일 업로드</p>
                <p className="text-xs text-gray-400">JPG, PNG, PDF (최대 5MB)</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="v-office">중개사무소명</Label>
          <Input
            id="v-office"
            type="text"
            value={form.office_name}
            onChange={(e) => setForm((f) => ({ ...f, office_name: e.target.value }))}
            maxLength={100}
            placeholder="선택 입력"
          />
        </div>

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white"
        >
          {mutation.isPending ? "검증 중..." : "인증 신청"}
        </Button>
      </form>
    </AuthLayout>
  );
}
