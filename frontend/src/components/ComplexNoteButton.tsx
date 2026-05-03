"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useComplexNote } from "@/hooks/useComplexNote";

interface Props {
  complexNo: string;
}

/** 단지 메모 버튼 + 모달 — 손님별 단지 메모 입력 (localStorage 영속) */
export default function ComplexNoteButton({ complexNo }: Props) {
  const { note, save, clear, maxLen } = useComplexNote(complexNo);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 모달 열릴 때 현재 메모 → draft 동기화 + textarea 포커스
  useEffect(() => {
    if (!open) return;
    setDraft(note);
    // 다음 tick 에 포커스 (DOM 마운트 직후)
    const id = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, note]);

  // ESC 닫기 (포커스 트랩 미적용 — textarea + 버튼 3~4개라 native Tab order 로 충분)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSave = useCallback(() => {
    save(draft);
    setOpen(false);
  }, [draft, save]);

  const handleClear = useCallback(() => {
    clear();
    setDraft("");
    setOpen(false);
  }, [clear]);

  const hasNote = note.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xl transition-colors ${hasNote ? "text-blue-600" : "text-gray-300 hover:text-blue-400"}`}
        aria-label={hasNote ? "단지 메모 보기·수정" : "단지 메모 추가"}
        title={hasNote ? `메모: ${note.slice(0, 30)}${note.length > 30 ? "…" : ""}` : "단지 메모 추가"}
      >
        {hasNote ? "📝" : "📄"}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="단지 메모"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">단지 메모</h3>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                aria-label="메모 모달 닫기"
              >×</button>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, maxLen))}
              maxLength={maxLen}
              placeholder="이 단지에 대한 메모를 입력하세요 (예: 학교 근처, 시세 상승세, 손님 ○○ 관심)"
              className="w-full h-40 rounded-md border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="text-right text-xs text-gray-500 mt-1">{draft.length} / {maxLen}자</div>
            <div className="flex justify-end gap-2 mt-3">
              {hasNote && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md"
                >삭제</button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
              >취소</button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md"
              >저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
