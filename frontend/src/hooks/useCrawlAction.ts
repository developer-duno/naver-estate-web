import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrawlProgress } from "@/types";
import { startLiveCrawl, getCrawlStatus, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

type MessageType = "info" | "error" | "success";

// 10초 내 재클릭이면 force=true 로 보내서 서버 쿨다운 우회
const FORCE_WINDOW_MS = 10_000;

// 크롤 완료 폴링 — 2초 간격, 최대 5분(150회)
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 150;

// 서버가 완료 상태로 반환하는 status 값들 (_crawl_bg.py + crawl.py 참조)
const TERMINAL_STATUSES = new Set(["done", "done_partial", "error", "idle"]);

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hour = Math.floor(diffMin / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  return `${day}일 전`;
}

function refetchComplexQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
) {
  // invalidateQueries 대신 refetchQueries 사용 — active 쿼리를 staleTime 무시하고
  // 즉시 재요청. invalidate 도 본질은 동일하지만 refetch 명시가 의도를 분명히 하고
  // 배지·매물·평·시세 네 쿼리가 동일 시점에 서버로 향하도록 보장.
  void queryClient.refetchQueries({ queryKey: queryKeys.articlesAll(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.complex(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.priceStats(complexNo) });
}

/**
 * 서버가 돌려준 last_crawled_at 을 Complex 쿼리 캐시에 즉시 주입 (낙관적 업데이트).
 * refetch 가 끝나기 전에도 배지가 "방금 전" 으로 바뀌어 사용자 체감 개선.
 * old 가 없거나 신규 값이 null 이면 건드리지 않음 — 다른 필드 보존.
 */
function patchLastCrawledAt(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
  lastCrawledAt: string | null | undefined,
) {
  if (!lastCrawledAt) return;
  queryClient.setQueryData(
    queryKeys.complex(complexNo),
    (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      return { ...old, last_crawled_at: lastCrawledAt };
    },
  );
}

/** 수동 크롤링 (데이터 갱신 버튼) 로직을 캡슐화 */
export function useCrawlAction(complexNo: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCachedAtRef = useRef<number>(0);

  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");

  const setMsg = useCallback((text: string, type: MessageType = "info") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 언마운트 시 타이머/폴링 정리
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      clearPolling();
    };
  }, [clearPolling]);

  const startPolling = useCallback(() => {
    clearPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const status = await getCrawlStatus(complexNo);
        // 진행 중에도 매물 수 변동 반영 (대략 current_page 기준)
        if (status.status === "running" && status.phase === "articles") {
          // 매 3 폴링(6초) 마다 조용히 articles 갱신 — 진행 체감용
          if (attempts % 3 === 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
          }
        }
        if (TERMINAL_STATUSES.has(status.status)) {
          clearPolling();
          refetchComplexQueries(queryClient, complexNo);
          setCrawling(false);
          if (status.status === "error") {
            setMsg("데이터 갱신 중 오류가 발생했습니다.", "error");
          } else if (status.status === "done_partial") {
            setMsg("일부 항목 갱신 완료", "success");
          } else {
            setMsg("갱신 완료", "success");
          }
          timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
          return;
        }
      } catch {
        // 네트워크 일시 오류는 무시하고 다음 폴링 기다림
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        // 5분 안에 done 못 받으면 중단하고 최소한 최신 DB 값 반영
        clearPolling();
        refetchComplexQueries(queryClient, complexNo);
        setCrawling(false);
        setMsg("갱신이 오래 걸립니다 — 나중에 다시 확인해주세요.", "info");
        timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
      }
    }, POLL_INTERVAL_MS);
  }, [complexNo, queryClient, clearPolling, setMsg]);

  const mutation = useMutation({
    mutationFn: async (force: boolean) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new ApiError("로그인이 필요합니다", 401);
      }
      return startLiveCrawl(complexNo, session.access_token, force);
    },
    onMutate: () => {
      setCrawling(true);
      setMsg("");
    },
    onSuccess: (result: CrawlProgress) => {
      if (result.status === "cached") {
        // 서버가 쿨다운으로 스킵 — DB 재조회 + 캐시 즉시 패치로 배지 빠르게 갱신
        patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at);
        refetchComplexQueries(queryClient, complexNo);
        lastCachedAtRef.current = Date.now();
        setCrawling(false);
        const ago = formatAgo(result.last_crawled_at);
        const agoText = ago ? `${ago} 갱신됨 · ` : "";
        setMsg(`${agoText}한 번 더 누르면 강제 갱신`, "success");
        timersRef.current.push(setTimeout(() => setMessage(""), 6_000));
        return;
      }
      // started 분기 — 서버가 돌려준 현재 last_crawled_at 즉시 반영(이전 시각)해서
      // 갱신 시작 순간에도 배지 표시가 어긋나지 않게 함. 진짜 "방금 전" 은
      // 폴링의 done 수신 후 refetch 로 교체.
      patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at);
      setMsg("데이터 갱신 중...", "info");
      // 서버 상태를 2초 간격 폴링 → done 순간 refetch + 성공 메시지
      startPolling();
      // 120초 UX 가드: 크롤이 길면(상세 수집 176건 등) 사용자가 버튼을 다시
      // 누를 수 있게 버튼만 활성화. **폴링은 계속 유지** — 완료 시 자동으로
      // 배지/매물 최신화. 혹시 버튼 다시 누르면 이미 _active_complexes 가드로
      // already_running 응답 → 사용자에게 "진행 중" 안내.
      timersRef.current.push(setTimeout(() => {
        if (pollRef.current) {
          setCrawling(false);
          setMsg("갱신이 오래 걸리고 있어요 — 완료되면 자동 반영됩니다.", "info");
          timersRef.current.push(setTimeout(() => setMessage(""), 5_000));
        }
      }, 120_000));
    },
    onError: (err: unknown) => {
      clearPolling();
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/complex/${complexNo}`)}`);
          setCrawling(false);
          return;
        }
        if (err.statusCode === 409) {
          setMsg("이미 크롤링이 진행 중입니다.", "info");
        } else if (err.statusCode === 403) {
          setMsg("크롤링 권한이 없습니다.", "error");
        } else if (err.statusCode === 429) {
          setMsg("일일 크롤링 한도를 초과했습니다.", "error");
        } else {
          setMsg("데이터 갱신에 실패했습니다.", "error");
        }
      } else {
        setMsg("데이터 갱신에 실패했습니다.", "error");
      }
      setCrawling(false);
    },
  });

  const handleCrawl = useCallback(() => {
    // 직전 cached 응답을 10초 안에 받은 상태면 force=true 로 재요청
    const force = Date.now() - lastCachedAtRef.current < FORCE_WINDOW_MS;
    mutation.mutate(force);
  }, [mutation]);

  return {
    crawling,
    message,
    messageType,
    setMsg,
    handleCrawl,
    timersRef,
  };
}
