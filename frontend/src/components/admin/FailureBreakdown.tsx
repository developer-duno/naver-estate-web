"use client";

/**
 * 24시간 이내 실패한 크롤 작업을 유형별로 모아 보여주는 카드.
 * 사용자가 "어떤 작업이 많이 실패했나" 한눈에 파악하도록.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminCrawlFailures } from "@/lib/api";
import { jobTypeLabel, jobTypeDesc } from "@/lib/crawl-job-labels";
import AdminCard from "./AdminCard";
import RawDetail from "./RawDetail";

interface Props {
  token: string;
  /** 클릭 시 상위에서 필터를 "failed" 로 적용 + 해당 유형으로 점프 (선택) */
  onJumpToFailed?: (jobType?: string) => void;
  /** true 면 카드 제목을 숨긴다 — 대시보드 접힌 절 안에서 절 제목과 두 줄로 겹치지 않게 (AdminCard.hideTitle) */
  hideTitle?: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "방금";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

export default function FailureBreakdown({ token, onJumpToFailed, hideTitle = false }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.crawlFailures(24),
    queryFn: () => getAdminCrawlFailures(token, 24),
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <AdminCard hideTitle={hideTitle}
        title="유형별 실패 분포 (최근 24시간)"
        help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요"
      >
        <div className="h-20 bg-gray-100 rounded animate-pulse" />
      </AdminCard>
    );
  }

  if (data.total === 0) {
    return (
      <AdminCard hideTitle={hideTitle}
        title="유형별 실패 분포 (최근 24시간)"
        help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요"
      >
        <p className="text-sm text-gray-500 py-4 text-center">
          최근 24시간 동안 실패한 작업이 없어요. 모두 정상이에요.
        </p>
      </AdminCard>
    );
  }

  return (
    <AdminCard hideTitle={hideTitle}
      title={`유형별 실패 분포 (최근 24시간 · 총 ${data.total}건)`}
      help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요. 행을 누르면 아래 표에서 그 유형의 실패 작업만 보여줘요"
    >
      <ul className="divide-y">
        {data.items.map((it) => (
          <li key={it.job_type}>
            <button
              type="button"
              onClick={() => onJumpToFailed?.(it.job_type)}
              className="w-full text-left pt-3 pb-1 px-1 hover:bg-gray-50 transition flex flex-wrap gap-x-3 gap-y-1 items-baseline"
              aria-label={`${jobTypeLabel(it.job_type)} ${it.count}건 실패 — 클릭 시 해당 유형 실패 작업으로 이동`}
            >
              {/* 작업 코드 원문(job_type)은 본문에 두지 않는다 — 마우스를 올리거나 아래 "원문 보기"로 */}
              <span className="font-medium text-gray-800" title={it.job_type}>
                {jobTypeLabel(it.job_type)}
              </span>
              <span className="text-red-700 font-semibold ml-auto">
                {it.count}건
              </span>
              {it.last_failed_at && (
                <span className="text-xs text-gray-500 w-full sm:w-auto sm:ml-3">
                  마지막 실패 {formatRelative(it.last_failed_at)}
                </span>
              )}
              {jobTypeDesc(it.job_type) && (
                <span className="text-xs text-gray-500 w-full leading-snug">
                  {jobTypeDesc(it.job_type)}
                </span>
              )}
            </button>
            {/* 오류 줄과 "원문 보기"는 버튼 밖에 둔다 — 버튼 안에 누를 거리(details)를 넣으면
                안 된다(인터랙티브 요소 중첩 금지). 휴대폰엔 마우스가 없어 title 만으로는 원문을 못 본다.
                우리말 번역(last_error_plain)이 오면 그것을 본문에. 번역이 없으면(옛 백엔드·빈 문자열)
                영어 원문을 본문에 두지 않고 고정 문구만 — 작업 목록 표(CrawlJobTable)도 오류를 보여 주지
                않으므로 "목록에서 확인" 이라고 쓰지 않는다.
                `||` 인 이유: `??` 는 빈 문자열을 통과시켜 본문이 비어 버린다. */}
            <div className="px-1 pb-3">
              {it.last_error && (
                <span
                  className="block text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1 leading-snug wrap-break-word"
                  title={it.last_error}
                >
                  {it.last_error_plain
                    ? `최근 오류: ${it.last_error_plain}`
                    : "최근 오류 기록 있음 — 아래 '원문 보기'를 누르면 원문이 보여요"}
                </span>
              )}
              <RawDetail
                raw={`작업 코드: ${it.job_type}${it.last_error ? `\n오류 원문: ${it.last_error}` : ""}`}
                className="mt-1"
              />
            </div>
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
