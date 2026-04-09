/**
 * 중개사 검증 API — 사용자용 검증 신청/상태 조회/자격증 업로드
 */
import type { LicenseUploadResponse, VerificationStatusResponse, VerifySubmitResponse } from "@/types/admin";
import { fetchApi, adminHeaders, getApiBase } from "./core";

interface VerifySubmitBody {
  business_number: string;
  office_name?: string;
  representative_name: string;
}

/** 중개사 검증 신청 */
export async function submitVerification(token: string, body: VerifySubmitBody): Promise<VerifySubmitResponse> {
  return fetchApi<VerifySubmitResponse>("/api/verify/submit", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 자격증 서류 업로드 */
export async function uploadLicenseDoc(token: string, file: File): Promise<LicenseUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${getApiBase()}/api/verify/upload-license`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "업로드 실패" }));
    throw new Error(data.detail ?? "업로드 실패");
  }

  return res.json();
}

/** 내 검증 상태 조회 */
export async function getVerificationStatus(token: string): Promise<VerificationStatusResponse> {
  return fetchApi<VerificationStatusResponse>("/api/verify/status", {
    headers: adminHeaders(token),
  });
}
