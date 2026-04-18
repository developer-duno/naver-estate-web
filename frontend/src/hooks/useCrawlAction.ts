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

function invalidateComplexQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
  queryClient.invalidateQueries({ queryKey: queryKeys.complex(complexNo) });
  queryClient.invalidateQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
  queryClient.invalidateQueries({ queryKey: queryKeys.priceStats(complexNo) });
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
          invalidateComplexQueries(queryClient, complexNo);
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
        invalidateComplexQueries(queryClient, complexNo);
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
        // 서버가 쿨다운으로 스킵 — 하지만 DB 재조회는 해서 화면 동기화
        invalidateComplexQueries(queryClient, complexNo);
        lastCachedAtRef.current = Date.now();
        setCrawling(false);
        const ago = formatAgo(result.last_crawled_at);
        const agoText = ago ? `${ago} 갱신됨 · ` : "";
        setMsg(`${agoText}한 번 더 누르면 강제 갱신`, "success");
        timersRef.current.push(setTimeout(() => setMessage(""), 6_000));
        return;
      }
      setMsg("데이터 갱신 중...", "info");
      // 서버 상태를 2초 간격 폴링 → done 순간 invalidate + 성공 메시지
      startPolling();
      // 60초 안전망: 폴링이 어떤 이유로든 terminal 못 받아도 버튼 강제 해제.
      // 사용자가 무한정 "갱신 중..." 상태로 묶이지 않도록 보장.
      timersRef.current.push(setTimeout(() => {
        if (pollRef.current) {
          clearPolling();
          invalidateComplexQueries(queryClient, complexNo);
          setCrawling(false);
          setMsg("갱신이 계속 진행 중일 수 있어요. 잠시 후 다시 확인해주세요.", "info");
          timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
        }
      }, 60_000));
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
