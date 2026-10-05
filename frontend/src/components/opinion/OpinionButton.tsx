"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

// 창은 처음 누를 때만 불러온다 — 모든 화면에 실리는 버튼이라 첫 화면 짐을 늘리지 않으려고.
// 한 번 열린 뒤에는 닫아도 그대로 두어 쓰던 글이 남는다.
const OpinionDialog = dynamic(() => import("./OpinionDialog"), { ssr: false });

/**
 * 모든 화면 오른쪽 아래에 떠 있는 "의견 보내기" 버튼 (세션 433 의견함).
 *
 * 자리 잡기 — 오른쪽 아래에는 이미 다른 것들이 있다:
 * - 새 버전 알림(VersionWatcher, z-50) 은 bottom-20 으로 올려 이 버튼 위에 뜬다.
 * - sonner 쪽지는 layout.tsx 의 Toaster offset 으로 이 버튼 위에 뜬다.
 * - 비교 막대(CompareFloatingBar·MbCompareFloatingBar, 화면 아래 전체 폭)가 보이면
 *   막대에 붙은 data-floating-bar 표식을 보고 bottom-16 으로 올라간다(:has 선택자).
 * - z-40 = 모달·모바일 메뉴(z-50) 아래.
 *
 * 관리자 화면(/admin)과 인쇄에서는 숨긴다.
 */
export default function OpinionButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // "/admin" 과 그 아래만 — "/administration…" 같은 다른 주소까지 숨기지 않게 마디로 비교한다
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label="의견 보내기"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="opinion-button"
        className="no-print fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-1.5 rounded-full border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 shadow-lg hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [body:has([data-floating-bar])_&]:bottom-16"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">의견 보내기</span>
        <span className="sm:hidden">의견</span>
      </button>
      {mounted && <OpinionDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
