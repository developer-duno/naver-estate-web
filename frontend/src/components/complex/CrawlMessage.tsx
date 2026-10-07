import type { MessageType } from "@/hooks/useCrawlAction";
import type { CrawlProgress } from "@/types";

interface CrawlMessageProps {
  crawling: boolean;
  message: string;
  messageType: MessageType;
  progress: CrawlProgress | null;
  onClear: () => void;
  /** 표 쿼리가 다시 받는 중 — 크롤 안내가 없을 때만 "갱신 중" 으로 보인다 */
  tableLoading?: boolean;
  /** 낡은 저장본을 받는 중이면 나이 안내("5일 전 자료예요") — 진행 글 앞에 붙인다 */
  staleLabel?: string | null;
}

/** 진행 단계(progress)를 한 줄 글로 바꾼다. progress 가 없으면 훅이 넘긴 문구를 쓴다. */
function progressText(progress: CrawlProgress | null, fallback: string): string {
  if (progress?.phase === "articles") {
    const count = progress.article_count ?? 0;
    return count > 0 ? `네이버에서 지금 매물 받는 중 · ${count}건` : "네이버에서 지금 매물 받는 중";
  }
  if (progress?.phase === "details") {
    const crawled = progress.detail_crawled_count ?? 0;
    const total = progress.detail_total ?? 0;
    return total > 0 ? `매물 상세 받는 중 · ${crawled}/${total}` : "매물 상세 받는 중";
  }
  if (progress?.phase === "enriching") return "단지 정보 보강 중";
  return fallback || "네이버에서 지금 매물 받는 중";
}

function Spinner() {
  return <span aria-hidden="true" className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600 shrink-0" />;
}

/**
 * 크롤 상태 한 줄 (세션 447) — "매물 N건" 줄 안, 버튼 옆에 그린다.
 * 진행·완료·쿨다운·오류를 모두 같은 자리에 띄워 표를 위아래로 밀지 않는다.
 * 글은 한 줄 말줄임(전체 문구는 title 로).
 */
export default function CrawlMessage({
  crawling,
  message,
  messageType,
  progress,
  onClear,
  tableLoading = false,
  staleLabel = null,
}: CrawlMessageProps) {
  if (crawling && messageType === "info") {
    const step = progressText(progress, message);
    const text = staleLabel ? `${staleLabel} · ${step}` : step;
    return (
      <div role="status" aria-live="polite" className="no-print flex items-center gap-1.5 min-w-0 text-xs text-blue-600">
        <Spinner />
        <span className="truncate" title={text}>{text}</span>
      </div>
    );
  }

  if (!message) {
    if (!tableLoading) return null;
    return (
      <div className="flex items-center gap-1.5 min-w-0" role="status" aria-label="매물 갱신 중">
        <Spinner />
        <span className="text-xs text-blue-600">갱신 중</span>
      </div>
    );
  }

  const tone =
    messageType === "error"
      ? "bg-red-50 text-red-600"
      : messageType === "info"
        ? "bg-blue-50 text-blue-600"
        : "bg-green-50 text-green-600";

  return (
    <div className={`no-print flex items-center gap-1.5 min-w-0 rounded px-2 py-0.5 text-xs ${tone}`}>
      <span className="truncate" title={message}>{message}</span>
      {messageType === "error" && (
        <button
          type="button"
          onClick={onClear}
          aria-label="닫기"
          className="text-red-400 hover:text-red-600 shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}
