"use client";

/**
 * 로그인 회원 전용 데이터 잠금 안내 카드 (B2 게이트 단계3 세션 313 → 세션 481 공개 전환)
 * — 네이버 매물·호가·가격 추이가 401/403 이거나 비로그인일 때 빈 에러 대신 표시.
 * 세션 481 부터 이 자료들은 승인이 아니라 로그인 뒤에 보인다. 공인중개사 인증은 새로 받기·
 * 실거래가 수집·엑셀 같은 행동 기능의 열쇠다. 공공 자료 카드는 비로그인에게도 보인다.
 *
 * reason: "login" = 비로그인·401 → 로그인 안내 / "forbidden" = 403(정지·권한 없음) → 인증·승인 상태 안내.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api/core";

/** 에러가 로그인·권한 거부(401/403)인지 판정 — isError 분기에서 사용. */
export function isAuthGateError(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

export type LockReason = "login" | "forbidden";

/** 잠금 사유 — 403 이면 "forbidden", 그 밖(401 등)은 "login". */
export function lockReasonOf(error: unknown): LockReason {
  return error instanceof ApiError && error.statusCode === 403 ? "forbidden" : "login";
}

interface Props {
  /** 어떤 데이터가 잠겼는지 (예: "매물 목록", "시세", "실거래가") */
  label?: string;
  /** 잠금 사유 — 기본 "login" */
  reason?: LockReason;
  className?: string;
}

/** 로그인 유도 안내 카드. 로그인(돌아올 주소 포함)/공인중개사 인증 버튼. */
export default function LockedDataCard({ label = "이 정보", reason = "login", className }: Props) {
  const pathname = usePathname();
  const loginHref = pathname && pathname !== "/login"
    ? `/login?redirect=${encodeURIComponent(pathname)}`
    : "/login";
  return (
    <Card className={`text-center py-8 px-4 bg-gray-50 border-gray-200 ${className ?? ""}`}>
      <Lock className="mx-auto h-10 w-10 text-gray-400" aria-hidden="true" strokeWidth={1.5} />
      {reason === "forbidden" ? (
        <>
          <p className="mt-3 text-sm font-medium text-gray-700">이 계정으로는 볼 수 없어요</p>
          <p className="mt-1 text-xs text-gray-500">공인중개사 인증·승인 상태를 확인해 주세요</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-gray-700">
            {label}은(는) 로그인하면 볼 수 있어요
          </p>
          <p className="mt-1 text-xs text-gray-500">
            로그인하면 네이버 매물·호가·가격 추이를 볼 수 있고, 공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀까지 쓸 수 있어요
          </p>
        </>
      )}
      <div className="mt-5 flex items-center justify-center gap-2">
        {reason === "login" && (
          <Link
            href={loginHref}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            로그인
          </Link>
        )}
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
