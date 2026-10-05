"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";

// 보내기 창은 처음 누를 때만 불러온다(OpinionButton 과 같은 방식) — 목록 본문은 서버가 그린다.
const OpinionDialog = dynamic(() => import("@/components/opinion/OpinionDialog"), { ssr: false });

/** "고쳤습니다" 화면 위쪽의 "의견 보내기" 버튼 — 서버 컴포넌트 안의 작은 클라이언트 섬 */
export default function OpinionOpenButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        의견 보내기
      </button>
      {mounted && <OpinionDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
