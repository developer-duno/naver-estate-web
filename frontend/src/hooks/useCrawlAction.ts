import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrawlProgress } from "@/types";
import { startLiveCrawl, getCrawlStatus, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

type MessageType = "info" | "error" | "success";

const POLL_INTERVAL_MS = 2_000;

// 2s × 150 = 5분. BE 백그라운드 스레드가 예외로 죽어서 _crawl_status 가
// "running" 고정으로 새어나오는 경우, FE 가 영원히 대기하지 않도록 강제 해제.
// 세션 63 already_running 분기 추가(130bc5f)에도 BE 상태 누수 시 폴링이 안전망
// 없이 무한 루프하는 시나리오를 사용자가 세션 64 에서 보고. 해당 방어망.
const MAX_POLL_ATTEMPTS = 150;

// 서버가 완료 상태로 반환하는 status 값들 (_crawl_bg.py + crawl.py 참조)
const TERMINAL_STATUSES = new Set(["done", "done_partial", "error", "idle"]);

// 네이버 장애 시 서버 error 원문을 UI 에 그대로 노출하면 스택트레이스·비밀정보가 새어
// 나갈 수 있어, 항상 아래 고정 한국어 문구로 교체한다.
const NAVER_BLOCKED_MESSAGE =
  "네이버가 막아서 지금은 갱신이 안 돼요. 이전에 저장된 데이터로 보여드릴게요. 잠시 뒤 다시 시도해주세요.";

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

function buildProgressMessage(status: CrawlProgress): string {
  if (status.status !== "running") return "갱신 중...";
  const phase = status.phase;
  if (phase === "articles") {
    const count = status.article_count ?? 0;
    const page = status.current_page ?? 0;
    if (count > 0 && page > 0) return `매물 수집 중 ${count}건 (${page}페이지)`;
    if (count > 0) return `매물 수집 중 ${count}건`;
    return "매물 목록 불러오는 중...";
  }
  if (phase === "enriching") return "단지 정보 보강 중...";
  if (phase === "details") {
    const crawled = status.detail_crawled_count ?? 0;
    const total = status.detail_total ?? 0;
    if (total > 0) return `매물 상세 수집 중 ${crawled}/${total}`;
    return "매물 상세 수집 중...";
  }
  return "갱신 중...";
}

function refetchComplexQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
) {
  // invalidateQueries 대신 refetchQueries 사용 — active 쿼리를 staleTime 무시하고
  // 즉시 재요청. 배지·매물·평·시세 네 쿼리가 동일 시점에 서버로 향하도록 보장.
  void queryClient.refetchQueries({ queryKey: queryKeys.articlesAll(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.complex(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.priceStats(complexNo) });
}

/**
 * 서버가 돌려준 last_crawled_at 을 Complex 쿼리 캐시에 즉시 주입 (낙관적 업데이트).
 * refetch 가 끝나기 전에도 배지가 "방금 전" 으로 바뀌어 사용자 체감 개선.
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

export interface UseCrawlActionOptions {
  /** 컴포넌트 마운트 시 1회 자동 실행 */
  auto?: boolean;
  /** 자동 실행 전제 조건 (모든 초기 쿼리 성공 후) */
  autoEnabled?: boolean;
}

/** 크롤 트리거 + 폴링 + UI 상태를 캡슐화. 수동 버튼과 자동 크롤이 동일 경로로 동작. */
export function useCrawlAction(complexNo: string, options: UseCrawlActionOptions = {}) {
  const { auto = false, autoEnabled = false } = options;
  const router = useRouter();
  const queryClient = useQueryClient();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTriggeredRef = useRef(false);
  // 폴링 중 연속 실패 카운터 — 3회 초과 시 progress=null 로 fallback 뷰 전환
  const consecutiveErrorsRef = useRef(0);

  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("info");
  const [progress, setProgress] = useState<CrawlProgress | null>(null);

  const setMsg = useCallback((text: string, type: MessageType = "info") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  const clearMessage = useCallback(() => setMessage(""), []);

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
    consecutiveErrorsRef.current = 0;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      // 5분 경과 시 강제 해제 — BE _crawl_status 가 "running" 고정으로 누수된
      // 상태라도 사용자 버튼을 무한 잠그지 않는다. 진짜 오래 걸리는 작업은
      // 새로고침 후 status 폴링이 다시 붙어 이어받는다.
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearPolling();
        setCrawling(false);
        setProgress(null);
        setMsg(
          "크롤링이 5분 이상 걸립니다. 새로고침 뒤 다시 시도해주세요.",
          "error",
        );
        return;
      }
      try {
        const status = await getCrawlStatus(complexNo);
        consecutiveErrorsRef.current = 0;
        if (status.status === "running") {
          // 진행률 문구 실시간 갱신 + progress 객체를 CrawlProgressBanner 에 전달
          setMsg(buildProgressMessage(status), "info");
          setProgress(status);
          // 매 3 폴링(6초) 마다 조용히 articles 갱신 — 진행 체감용
          if (status.phase === "articles" && attempts % 3 === 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
          }
          return;
        }
        if (TERMINAL_STATUSES.has(status.status)) {
          clearPolling();
          setCrawling(false);
          setProgress(null);
          if (status.status === "error") {
            // 🚨 refetch/invalidate 호출 금지 — 기존 저장 데이터를 그대로 유지
            //    사용자가 X 눌러 배너 닫을 때까지 메시지 유지 (자동 사라짐 X)
            setMsg(NAVER_BLOCKED_MESSAGE, "error");
            return;
          }
          refetchComplexQueries(queryClient, complexNo);
          if (status.status === "done_partial") {
            setMsg("일부 항목 갱신 완료", "success");
          } else {
            setMsg("갱신 완료", "success");
          }
          timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
        }
      } catch {
        // 간헐 네트워크 실패는 무시, 3회 연속 실패 시 fallback 전환
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= 3) {
          setProgress(null);
          setMsg("서버 응답 확인 중...", "info");
        }
      }
    }, POLL_INTERVAL_MS);
  }, [complexNo, queryClient, clearPolling, setMsg]);

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
      setProgress(null);
      setMsg("매물 목록 불러오는 중...", "info");
    },
    onSuccess: (result: CrawlProgress) => {
      if (result.status === "cached") {
        // 서버가 쿨다운으로 스킵 — DB 재조회 + 캐시 즉시 패치로 배지 빠르게 갱신
        patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at);
        refetchComplexQueries(queryClient, complexNo);
        setCrawling(false);
        setProgress(null);
        const ago = formatAgo(result.last_crawled_at);
        setMsg(ago ? `${ago} 갱신됨` : "최근 갱신됨", "success");
        timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
        return;
      }
      if (result.status === "already_running") {
        // 자동 크롤 폴링이 이미 진행 중인 상태를 서버가 감지.
        // startPolling 재호출하면 2개 interval 이 겹치고, setCrawling 을
        // 건드리면 기존 폴링의 종료 시점 해제 로직과 꼬인다. 메시지만 교체.
        // 문구는 기존 onError 409 분기와 톤 통일 — 사용자 입장에서 동일 상황.
        setMsg("이미 크롤링이 진행 중입니다.", "info");
        return;
      }
      // started 분기 — 서버가 돌려준 현재 last_crawled_at 즉시 반영(이전 시각)해서
      // 갱신 시작 순간에도 배지 표시가 어긋나지 않게 함. 진짜 "방금 전" 은
      // 폴링의 done 수신 후 refetch 로 교체.
      patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at);
      // 서버 상태를 2초 간격 폴링 → terminal 신호 수신 시 종료
      startPolling();
    },
    onError: (err: unknown) => {
      clearPolling();
      setProgress(null);
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
          setMsg(NAVER_BLOCKED_MESSAGE, "error");
        }
      } else {
        setMsg(NAVER_BLOCKED_MESSAGE, "error");
      }
      setCrawling(false);
    },
  });

  const handleCrawl = useCallback(() => {
    if (crawling) return;
    mutation.mutate();
  }, [mutation, crawling]);

  // 자동 크롤: 마운트 후 초기 쿼리 성공 시점에 1회만 실행
  useEffect(() => {
    if (!auto || !autoEnabled) return;
    if (autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    mutation.mutate();
    // mutation 객체는 매 렌더 새로 만들어지므로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoEnabled]);

  return {
    crawling,
    message,
    messageType,
    progress,
    setMsg,
    clearMessage,
    handleCrawl,
  };
}
