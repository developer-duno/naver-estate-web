/**
 * 승인 중개사 전용 데이터 잠금 안내 카드 (B2 게이트 단계3, 세션 313)
 * — 매물·시세·실거래·면적 데이터가 403(승인 권한 거부)일 때 빈 에러 대신 표시.
 * 단지 메타(이름·위치)는 보이고 이 카드가 그 아래 데이터 영역을 대체한다.
 */
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api/core";

/** 에러가 승인 권한 거부(401/403)인지 판정 — isError 분기에서 사용. */
export function isAuthGateError(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

interface Props {
  /** 어떤 데이터가 잠겼는지 (예: "매물 목록", "시세", "실거래가") */
  label?: string;
  className?: string;
}

/** 승인 중개사 전용 안내 카드. 로그인/공인중개사 인증 유도. */
export default function LockedDataCard({ label = "이 정보", className }: Props) {
  return (
    <Card className={`text-center py-8 px-4 bg-gray-50 border-gray-200 ${className ?? ""}`}>
      <Lock className="mx-auto h-10 w-10 text-gray-400" aria-hidden="true" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium text-gray-700">
        {label}은(는) 승인된 공인중개사만 볼 수 있어요
      </p>
      <p className="mt-1 text-xs text-gray-500">
        로그인 후 공인중개사 인증을 마치면 매물·시세·실거래가를 모두 이용할 수 있습니다.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link
          href="/login"
          className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          로그인
        </Link>
        <Link
          href="/verify"
          className="px-4 py-2 text-sm rounded-md border border-blue-300 text-blue-600 hover:bg-blue-50"
        >
          공인중개사 인증
        </Link>
      </div>
    </Card>
  );
}
