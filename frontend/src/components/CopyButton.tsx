"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** 클립보드에 복사할 본문 (호출처에서 면책 문구까지 포함해 구성) */
  text: string;
  /** 접근성 라벨 (기본 "결과 복사") */
  label?: string;
  className?: string;
}

/**
 * 결과값을 클립보드로 복사하는 작은 버튼.
 * - 성공: 2초간 Check 아이콘 + "복사됐어요" 토스트
 * - 실패/미지원: "복사하지 못했어요" 토스트 (throw 안 함 — silent failure 방지)
 *
 * 복사 본문(text)의 형식·면책 문구는 호출처(각 결과 카드)가 구성한다.
 * CopyButton 은 받은 text 를 그대로 복사할 뿐 형식을 알지 못한다.
 */
export default function CopyButton({ text, label = "결과 복사", className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard unsupported");
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("복사됐어요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사하지 못했어요");
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? "복사됨" : "복사"}
    </button>
  );
}
