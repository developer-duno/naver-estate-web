import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrawlProgress } from "@/types";
import { startLiveCrawl, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

type MessageType = "info" | "error" | "success";

// 10초 내 재클릭이면 force=true 로 보내서 서버 쿨다운 우회
const FORCE_WINDOW_MS = 10_000;

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
  const lastCachedAtRef = useRef<number>(0);

  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");

  const setMsg = useCallback((text: string, type: MessageType = "info") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

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
      [10_000, 20_000, 30_000].forEach((delay) => {
        timersRef.current.push(setTimeout(() => {
          invalidateComplexQueries(queryClient, complexNo);
        }, delay));
      });
      timersRef.current.push(setTimeout(() => {
        setCrawling(false);
        setMessage("");
      }, 30_000));
    },
    onError: (err: unknown) => {
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
