import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startLiveCrawl, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

type MessageType = "info" | "error" | "success";

/** 수동 크롤링 (데이터 갱신 버튼) 로직을 캡슐화 */
export function useCrawlAction(complexNo: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    mutationFn: async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new ApiError("로그인이 필요합니다", 401);
      }
      return startLiveCrawl(complexNo, session.access_token);
    },
    onMutate: () => {
      setCrawling(true);
      setMsg("");
    },
    onSuccess: (result: { status: string }) => {
      if (result.status === "cached") {
        setCrawling(false);
        setMsg("최근 갱신된 데이터입니다", "success");
        timersRef.current.push(setTimeout(() => setMessage(""), 3_000));
        return;
      }
      setMsg("데이터 갱신 중...", "info");
      [10_000, 20_000, 30_000].forEach((delay) => {
        timersRef.current.push(setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
          queryClient.invalidateQueries({ queryKey: queryKeys.complex(complexNo) });
          queryClient.invalidateQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
          queryClient.invalidateQueries({ queryKey: queryKeys.priceStats(complexNo) });
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

  return {
    crawling,
    message,
    messageType,
    setMsg,
    handleCrawl: () => mutation.mutate(),
    timersRef,
  };
}
