/**
 * 중개사 검증 API — 사용자용 검증 신청/상태 조회
 */
import type { VerificationStatusResponse, VerifySubmitResponse } from "@/types/admin";
import { fetchApi, adminHeaders } from "./core";

interface VerifySubmitBody {
  license_number?: string;
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

/** 내 검증 상태 조회 */
export async function getVerificationStatus(token: string): Promise<VerificationStatusResponse> {
  return fetchApi<VerificationStatusResponse>("/api/verify/status", {
    headers: adminHeaders(token),
  });
}
