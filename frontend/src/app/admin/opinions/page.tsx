"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
import OpinionEditor from "@/components/admin/OpinionEditor";
import { getAdminOpinions } from "@/lib/api";
import {
  OPINION_PAGE_SIZE,
  type AdminOpinion,
  type AdminOpinionKind,
  type AdminOpinionsResponse,
  type OpinionStatus,
} from "@/lib/api/opinions";
import { ADMIN_STATUS_LABELS, OPINION_KIND_LABELS, formatKstDate } from "@/lib/opinion-labels";

/** 개인정보가 남은 가장 오래된 의견이 이 날수를 넘으면 1년 정리 잡이 멈춘 것이다 */
const PURGE_STALE_DAYS = 366;

/** 자동 오류 행의 '보낸 분' 칸 — 사람이 아니므로 반복 횟수와 마지막 시각을 보인다 */
function errorRepeatText(o: AdminOpinion): string {
  return `${o.repeat_count ?? 1}번 반복 · 마지막 ${formatKstDate(o.last_seen_at ?? o.created_at, true)}`;
}

/**
 * 관리자 의견함 (세션 437 PR C) — 손님 의견 목록·답장·공개 전환.
 * 화면 경로(page_path)는 손님이 보낸 값이라 글자로만 보여 준다(링크로 만들지 않는다).
 * 세션 439: 화면 오류 자동 보고('자동 오류' 종류)를 같은 목록에서 본다 — 답장·공개는 없다.
 */
export default function AdminOpinionsPage() {
  const [status, setStatus] = useState<OpinionStatus | "">("");
  const [kind, setKind] = useState<AdminOpinionKind | "">("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const { token, getToken } = useTokenReady();

  const params = { status: status || undefined, kind: kind || undefined, page };
  const query = useQuery<AdminOpinionsResponse, Error>({
    // {status: undefined, kind: undefined, page: 1} 은 메뉴 배지의 {page: 1} 과 같은 키가 된다(undefined 칸은 해시에서 빠짐)
    queryKey: queryKeys.admin.opinions(params as Record<string, unknown>),
    queryFn: () => getAdminOpinions(token, params),
    enabled: !!token,
    staleTime: 30_000,
  });

  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / OPINION_PAGE_SIZE));
  const items = query.data?.items ?? [];
  const oldestDays = query.data?.oldest_days;

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">의견함</h2>

      {typeof oldestDays === "number" && (
        <p
          data-testid="opinion-oldest-days"
          className={`text-sm mb-4 ${oldestDays > PURGE_STALE_DAYS ? "text-red-600 font-medium" : "text-gray-500"}`}
        >
          가장 오래된 의견 {oldestDays}일째
          {oldestDays > PURGE_STALE_DAYS && " — 1년 정리가 멈춘 것 같아요 — Claude 에게 알려주세요"}
        </p>
      )}

      {query.error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
          {query.error.message}
        </div>
      )}

      <AdminCard
        title={`의견 목록 (총 ${total}건 · 새 의견 ${query.data?.new_count ?? 0}건)`}
        help="손님이 오른쪽 아래 '의견 보내기'로 보낸 글이에요. 줄을 펼쳐 답장을 쓰면 로그인한 분께는 가입 이메일로 한 번 메일이 가요. 공개를 켜면 공개 제목·공개 답만 '고쳤습니다' 화면에 실려요(원문·이메일은 안 실림). 의견은 1년 뒤 원문이 지워져요. 손님 화면에서 난 오류는 '자동 오류'로 쌓이고(같은 오류는 횟수만 늘어요) 답장·공개는 없어요"
        action={
          <div className="flex gap-2">
            <select
              aria-label="종류로 거르기"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as AdminOpinionKind | "");
                setPage(1);
                setOpenId(null);
              }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="">전체 종류</option>
              {(Object.keys(OPINION_KIND_LABELS) as AdminOpinionKind[]).map((k) => (
                <option key={k} value={k}>
                  {OPINION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              aria-label="상태로 거르기"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OpinionStatus | "");
                setPage(1);
                setOpenId(null);
              }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="">전체</option>
              {(Object.keys(ADMIN_STATUS_LABELS) as OpinionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ADMIN_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {query.isLoading ? (
          <div className="text-sm text-gray-500 py-8 text-center" role="status">
            불러오는 중...
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">의견이 없어요</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">날짜</th>
                  <th className="py-2 pr-3 font-medium">종류</th>
                  <th className="py-2 pr-3 font-medium">화면 경로</th>
                  <th className="py-2 pr-3 font-medium">보낸 분</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">펼치기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const open = openId === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatKstDate(o.created_at, true)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{OPINION_KIND_LABELS[o.kind] ?? o.kind}</td>
                        <td className="py-2 pr-3 break-all text-gray-600">{o.page_path ?? "-"}</td>
                        <td className="py-2 pr-3 break-all">
                          {o.kind === "error" ? errorRepeatText(o) : (o.user_email ?? "로그인 안 함")}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{ADMIN_STATUS_LABELS[o.status] ?? o.status}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : o.id)}
                            aria-expanded={open}
                            aria-label={`${o.id}번 의견 ${open ? "접기" : "펼치기"}`}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            {open ? "접기" : "펼치기"}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b">
                          <td colSpan={6} className="p-0">
                            <OpinionEditor opinion={o} getToken={getToken} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {total > OPINION_PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">
            {page} / {lastPage} 쪽
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= lastPage}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
