"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminTraffic, type TrafficStats, type TrafficWindow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "./AdminCard";

interface Props {
  getToken: () => Promise<string>;
}

type WindowKey = "10m" | "1h" | "24h";

const WINDOW_LABEL: Record<WindowKey, string> = {
  "10m": "10분",
  "1h": "1시간",
  "24h": "24시간",
};

const WINDOW_ORDER: readonly WindowKey[] = ["10m", "1h", "24h"];

/** 경로 그룹 → 사람이 읽을 한글 이름. 없는 그룹은 원본 그대로 표시. */
const PATH_LABEL: Record<string, string> = {
  "/api/live": "실시간 검색·크롤",
  "/api/complexes": "단지·매물",
  "/api/mb": "미분양·분양",
  "/api/admin": "관리자",
  "/api/articles": "매물 내려받기",
  "/api/users": "사용자",
  "/api/verify": "중개사 검증",
  "/api/payment": "결제",
  other: "기타",
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}일 ${h % 24}시간`;
  }
  return `${h}시간 ${m}분`;
}

function num(n: number): string {
  return n.toLocaleString("ko");
}

/** 에러율 색상 — 5xx 는 1% 넘으면 빨강, 4xx 는 10% 넘으면 주황 */
function rateClass(rate: number, warn: number, danger: number): string {
  if (rate >= danger) return "text-red-700 font-semibold";
  if (rate >= warn) return "text-amber-700";
  return "text-gray-700";
}

export default function TrafficCard({ getToken }: Props) {
  const { data, isLoading, error } = useQuery<TrafficStats, Error>({
    queryKey: queryKeys.admin.traffic(),
    queryFn: async () => {
      const token = await getToken();
      return getAdminTraffic(token);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const uptime = data?.process_uptime_seconds;
  const uptimeUnder24h = uptime != null && uptime < 86400;
  const hourWindow: TrafficWindow | undefined = data?.windows["1h"];

  return (
    <AdminCard
      title="트래픽 (요청 수 · 방문자 · 속도 · 오류)"
      help="사람들이 우리 서비스를 얼마나 쓰고 있는지 보여줘요. 요청 수는 총 몇 번 불렀는지예요. 방문자는 '대략 몇 명'으로만 보세요 — 로그인한 분은 한 시간마다 표가 새로 발급되는데 그때마다 다른 사람으로 세어져서, 실제 인원보다 부풀려 나옵니다. 속도는 절반의 사람이 그 시간 안에 답을 받았다는 뜻(중간)과, 느린 쪽 5%가 겪는 시간(느림)이고요. 오류가 늘거나 느림이 몇 초까지 올라가면 서버가 버거워진다는 신호예요. 서버를 껐다 켜면 숫자는 0부터 다시 세요"
      action={
        uptime != null ? (
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              uptimeUnder24h
                ? "bg-amber-50 text-amber-700 border-amber-300"
                : "bg-green-50 text-green-700 border-green-300"
            }`}
            title="프로세스 재시작 후 카운터가 리셋됩니다"
          >
            가동 {formatUptime(uptime)}
          </span>
        ) : undefined
      }
    >
      {isLoading && !data && <div className="h-[160px] bg-gray-100 animate-pulse rounded" />}

      {error && (
        <p className="text-xs text-red-700">
          트래픽 통계를 불러오지 못했습니다: {error.message}
        </p>
      )}

      {data && (
        <>
          {data.window_truncated && (
            <p className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              기록 저장 한도({num(data.max_records)}건)에 걸려 오래된 기록을 버렸어요. 24시간
              숫자는 실제보다 작습니다.
            </p>
          )}

          {/* 방문자 상한 초과 고지 — 조용히 누락시키지 않는다(세션 398 W10).
              ⚠ 어느 기간이 잘렸는지까지 밝힌다(세션 399 적대검증): 전 기간 OR 로 묶으면
                 24h 만 상한을 넘어도 정확한 10분·1시간 숫자까지 "실제보다 적다"고
                 오고지해 맞는 수치의 신뢰도를 깎는다.
              ⚠ `data.windows[k]` 는 옵셔널 체이닝으로 읽는다 — 응답이 3키를 다 안 주면
                 가드 없는 역참조가 TypeError 를 던지고, 이 카드는 /admin 에 무조건
                 마운트되는데 에러 바운더리가 없어 대시보드 전체가 백지가 된다. */}
          {(() => {
            const capped = WINDOW_ORDER.filter((k) => data.windows[k]?.visitors_capped);
            if (capped.length === 0) return null;
            return (
              <p className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {capped.map((k) => WINDOW_LABEL[k]).join(" · ")} 기간은 방문자가 너무 많아 세는
                한도를 넘었어요. 그 기간의 방문자 숫자는 실제보다 적게 나옵니다.
              </p>
            );
          })()}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-1.5 font-medium">기간</th>
                  <th className="text-right py-1.5 font-medium">요청 수</th>
                  <th className="text-right py-1.5 font-medium">방문자(대략)</th>
                  <th className="text-right py-1.5 font-medium">속도(중간)</th>
                  <th className="text-right py-1.5 font-medium">속도(느림)</th>
                  <th className="text-right py-1.5 font-medium">오류 4xx</th>
                  <th className="text-right py-1.5 font-medium">오류 5xx</th>
                </tr>
              </thead>
              <tbody>
                {WINDOW_ORDER.map((key) => {
                  const w = data.windows[key];
                  return (
                    <tr key={key} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-700">{WINDOW_LABEL[key]}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(w.total_requests)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(w.unique_visitors)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(Math.round(w.p50_ms))}ms</td>
                      <td className="py-1.5 text-right tabular-nums">{num(Math.round(w.p95_ms))}ms</td>
                      <td className={`py-1.5 text-right tabular-nums ${rateClass(w.rate_4xx, 10, 30)}`}>
                        {w.rate_4xx}%
                      </td>
                      <td className={`py-1.5 text-right tabular-nums ${rateClass(w.rate_5xx, 1, 5)}`}>
                        {w.rate_5xx}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 경로별 (최근 1시간) */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5">
                많이 불린 곳 (최근 1시간)
              </h4>
              {!hourWindow || hourWindow.top_paths.length === 0 ? (
                <p className="text-xs text-gray-500">아직 집계된 요청이 없습니다</p>
              ) : (
                <ul className="space-y-1">
                  {hourWindow.top_paths.map((p) => (
                    <li key={p.path} className="flex justify-between text-xs">
                      <span className="text-gray-700">
                        {PATH_LABEL[p.path] ?? p.path}
                        {PATH_LABEL[p.path] && (
                          <span className="ml-1 text-[10px] text-gray-400">({p.path})</span>
                        )}
                      </span>
                      <span className="tabular-nums text-gray-600">{num(p.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 상위 식별자 = 남용 감지용. 자동 차단 없음 (오탐 시 정상 사용자 차단 위험) */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5">
                가장 많이 쓴 사람 (최근 1시간)
              </h4>
              {!hourWindow || hourWindow.top_identities.length === 0 ? (
                <p className="text-xs text-gray-500">아직 집계된 요청이 없습니다</p>
              ) : (
                <ul className="space-y-1">
                  {hourWindow.top_identities.map((u) => (
                    <li key={u.identity} className="flex justify-between text-xs">
                      <span className="font-mono text-gray-600">{u.identity}</span>
                      <span className="tabular-nums text-gray-600">{num(u.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-gray-500">
            누가 썼는지는 알아볼 수 없게 섞어서 저장해요(원래 주소나 로그인 정보는 안 남겨요).
            한 사람이 유난히 많이 부르는 게 보여도 자동으로 막지는 않아요 — 멀쩡한 사람을 잘못
            막을 수 있어서, 보고 사람이 판단하는 용도예요. 30초마다 저절로 새로 고쳐져요.
          </p>
        </>
      )}
    </AdminCard>
  );
}
