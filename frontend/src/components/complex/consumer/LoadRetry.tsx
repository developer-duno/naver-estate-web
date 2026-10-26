"use client";

/**
 * 소비자 카드 공용 "불러오지 못했어요 · 다시 시도" 줄(세션 482 PR 1b 보완 A-4).
 * 서버 오류를 "자료 없음"처럼 숨기지 않는다(.claude/rules/error-propagation.md) — 래퍼가 던진 오류를 카드가 이 줄로 보인다.
 */
export default function LoadRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-xs text-gray-500 flex items-center gap-2" data-testid="consumer-load-retry">
      <span>일부 자료를 불러오지 못했어요</span>
      <button
        type="button"
        onClick={onRetry}
        className="border border-gray-300 rounded px-2 py-0.5 text-gray-700 hover:bg-gray-50"
      >
        다시 시도
      </button>
    </p>
  );
}
