"use client";

import type { CrawlProgress } from "@/types";

interface CrawlProgressBannerProps {
  progress: CrawlProgress | null;
  crawling: boolean;
  /** already_running 등 progress=null + crawling=true 인 중간 상태 문구 */
  fallbackMessage?: string;
}

type StepState = "done" | "active" | "waiting";

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className} text-blue-600`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="img"
      aria-label="크롤링 진행 중"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === "active") {
    return <Spinner className="w-4 h-4 shrink-0" />;
  }
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="8" strokeWidth={2} />
    </svg>
  );
}

function StepRow({ state, label }: { state: StepState; label: string }) {
  const textClass =
    state === "active"
      ? "text-blue-700 font-medium animate-pulse"
      : state === "done"
        ? "text-green-700"
        : "text-gray-400";
  return (
    <div className="flex items-center gap-2">
      <StepIcon state={state} />
      <span className={`text-xs ${textClass}`}>{label}</span>
    </div>
  );
}

function ProgressBar({ percent, indeterminate }: { percent?: number; indeterminate?: boolean }) {
  if (indeterminate) {
    return (
      <div className="w-full bg-blue-100 rounded h-1.5 overflow-hidden" aria-hidden="true">
        <div className="h-full bg-blue-500 rounded animate-pulse" style={{ width: "60%" }} />
      </div>
    );
  }
  const width = Math.min(100, Math.max(0, Math.round(percent ?? 0)));
  return (
    <div className="w-full bg-blue-100 rounded h-1.5 overflow-hidden" aria-hidden="true">
      <div
        className="h-full bg-blue-500 rounded transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function CrawlProgressBanner({
  progress,
  crawling,
  fallbackMessage,
}: CrawlProgressBannerProps) {
  if (!crawling) return null;

  // Fallback: 크롤링 시작 직후 / already_running / 3회 연속 폴링 실패 복구 중
  if (!progress) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="no-print rounded-md px-4 py-3 bg-blue-50 text-blue-700 min-h-[140px] md:min-h-[120px] flex flex-col gap-3"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Spinner />
          <span className="animate-pulse">{fallbackMessage ?? "크롤링 준비 중..."}</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <StepRow state="waiting" label="매물 목록 받기" />
          <StepRow state="waiting" label="매물 상세 받기" />
        </div>
        <ProgressBar indeterminate />
      </div>
    );
  }

  const phase = progress.phase;
  const step1: StepState = phase === "articles" ? "active" : "done";
  const step2: StepState =
    phase === "articles" ? "waiting" : "active"; // enriching 또는 details

  let headline = "갱신 중...";
  let percent: number | undefined;
  let indeterminate = true;

  if (phase === "articles") {
    const count = progress.article_count ?? 0;
    const page = progress.current_page ?? 0;
    if (count > 0 && page > 0) headline = `매물 목록 받는 중 · ${count}건 (${page}페이지)`;
    else if (count > 0) headline = `매물 목록 받는 중 · ${count}건`;
    else headline = "매물 목록 받는 중...";
  } else if (phase === "enriching") {
    headline = "매물 상세 준비 중...";
  } else if (phase === "details") {
    const crawled = progress.detail_crawled_count ?? 0;
    const total = progress.detail_total ?? 0;
    if (total > 0) {
      headline = `매물 상세 받는 중 · ${crawled}/${total}건`;
      percent = (crawled / total) * 100;
      indeterminate = false;
    } else {
      headline = "매물 상세 받는 중...";
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print rounded-md px-4 py-3 bg-blue-50 text-blue-700 min-h-[140px] md:min-h-[120px] flex flex-col gap-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Spinner />
        <span className="animate-pulse">{headline}</span>
      </div>
      <div className="flex flex-wrap gap-4">
        <StepRow state={step1} label="매물 목록 받기" />
        <StepRow state={step2} label="매물 상세 받기" />
      </div>
      <ProgressBar percent={percent} indeterminate={indeterminate} />
    </div>
  );
}
