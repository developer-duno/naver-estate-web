import CrawlProgressBanner from "@/components/CrawlProgressBanner";
import type { MessageType } from "@/hooks/useCrawlAction";
import type { CrawlProgress } from "@/types";

interface CrawlMessageProps {
  crawling: boolean;
  message: string;
  messageType: MessageType;
  progress: CrawlProgress | null;
  onClear: () => void;
}

/**
 * 크롤 상태 메시지 블록.
 * 진행 중(info + crawling)이면 상세 진행률 배너, 완료/에러/쿨다운은 1줄 메시지.
 */
export default function CrawlMessage({
  crawling,
  message,
  messageType,
  progress,
  onClear,
}: CrawlMessageProps) {
  if (crawling && messageType === "info") {
    return (
      <CrawlProgressBanner
        progress={progress}
        crawling={crawling}
        fallbackMessage={message || undefined}
      />
    );
  }

  if (!message) return null;

  return (
    <div className={`text-sm rounded-md px-4 py-2 flex justify-between items-center gap-3 ${
      messageType === "error"
        ? "bg-red-50 text-red-600"
        : messageType === "info"
          ? "bg-blue-50 text-blue-600"
          : "bg-green-50 text-green-600"
    }`}>
      <span>{message}</span>
      {messageType === "error" && (
        <button
          type="button"
          onClick={onClear}
          aria-label="닫기"
          className="text-red-400 hover:text-red-600 flex-shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}
