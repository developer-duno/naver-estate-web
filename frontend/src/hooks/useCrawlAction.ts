import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, hashKey, type QueryKey } from "@tanstack/react-query";
import type { Complex, CrawlProgress } from "@/types";
import { startLiveCrawl, getCrawlStatus, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import { formatTimeAgo } from "@/components/complex/ComplexHeader";
import { diffArticleLists, type ArticleListSnapshot } from "@/lib/article-list-diff";

export type MessageType = "info" | "error" | "success";

const POLL_INTERVAL_MS = 2_000;

// 서버가 완료 상태로 반환하는 status 값들 (_crawl_bg.py + crawl.py 참조)
const TERMINAL_STATUSES = new Set(["done", "done_partial", "error", "idle"]);

// 네이버 장애 시 서버 error 원문을 UI 에 그대로 노출하면 스택트레이스·비밀정보가 새어
// 나갈 수 있어, 항상 아래 고정 한국어 문구로 교체한다.
const NAVER_BLOCKED_MESSAGE =
  "네이버가 막아서 지금은 갱신이 안 돼요. 이전에 저장된 데이터로 보여드릴게요. 잠시 뒤 다시 시도해주세요.";

// done_partial = 이미 삭제된 매물이 많아 서버가 상세 수집을 조기 종료한 정상 동작
// (_detail_worker.py DETAIL_FAILURE_THRESHOLD). "일부만 됐다" 로만 보이면 사용자가
// 크롤링이 덜 끝난 줄 알고 재시도하므로, 이유를 함께 알린다.
const PARTIAL_DONE_MESSAGE =
  "갱신 완료. 이미 삭제된 매물이 많아 일부는 상세 정보를 가져오지 못했어요.";

// 저장본 나이 기준 (세션 447) — 크롤 시작 순간 articles_crawled_at 이 이보다 오래됐거나 없으면 "낡은 자료"
// (last_crawled_at 은 다른 수집기가 지도 단지 전부에 찍어 매물 저장본 나이가 아니다 — 세션 448)
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const START_MESSAGE = "네이버에서 지금 매물 받는 중";

/**
 * 크롤 시작 순간의 articles_crawled_at(매물 목록을 끝까지 받은 시각)으로 저장본 나이를 판정한다.
 * 새 자료(24시간 이하)면 null, 낡은 자료면 화면 안내 글("5일 전 자료예요" 등).
 */
export function staleLabelFor(lastCrawledAt: string | null | undefined, now = Date.now()): string | null {
  if (!lastCrawledAt) return "저장된 자료가 오래됐어요";
  const age = now - new Date(lastCrawledAt).getTime();
  if (age <= STALE_AFTER_MS) return null;
  if (Number.isNaN(age)) return "저장된 자료가 오래됐어요";
  return `${formatTimeAgo(lastCrawledAt)} 자료예요`;
}

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
 * 새 자료일 때의 종료 처리 (세션 447) — 카드·배지·평형·시세는 지금처럼 다시 받고,
 * 표(필터·페이지가 붙은 articles 키)는 다시 받지 않고 낡음 표시만 한다(refetchType:"none").
 * 다른 페이지·필터로 옮기면 그때 서버에서 새로 받는다.
 */
function refetchNonTableQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo), refetchType: "none" });
  void queryClient.refetchQueries({ queryKey: queryKeys.articles(complexNo, undefined), exact: true });
  void queryClient.refetchQueries({ queryKey: queryKeys.complex(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
  void queryClient.refetchQueries({ queryKey: queryKeys.priceStats(complexNo) });
}

/**
 * 서버가 돌려준 last_crawled_at·articles_crawled_at 을 Complex 쿼리 캐시에 즉시 주입 (낙관적 업데이트).
 * refetch 가 끝나기 전에도 배지가 "방금 전" 으로 바뀌어 사용자 체감 개선. 값이 없는 키는 건드리지 않는다.
 */
function patchLastCrawledAt(
  queryClient: ReturnType<typeof useQueryClient>,
  complexNo: string,
  lastCrawledAt: string | null | undefined,
  articlesCrawledAt?: string | null,
) {
  if (!lastCrawledAt && !articlesCrawledAt) return;
  queryClient.setQueryData(
    queryKeys.complex(complexNo),
    (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      return {
        ...old,
        ...(lastCrawledAt ? { last_crawled_at: lastCrawledAt } : {}),
        ...(articlesCrawledAt ? { articles_crawled_at: articlesCrawledAt } : {}),
      };
    },
  );
}

export interface UseCrawlActionOptions {
  /** 컴포넌트 마운트 시 1회 자동 실행 */
  auto?: boolean;
  /** 자동 실행 전제 조건 (모든 초기 쿼리 성공 후) */
  autoEnabled?: boolean;
  /**
   * 지금 화면의 표(매물 목록) — 새 자료 크롤이 끝나면 같은 조건으로 따로 받아 비교한다 (세션 447).
   * queryKey = 표 쿼리 키, fetch = 같은 조건(필터·정렬·페이지·크기)으로 캐시를 거치지 않고 받기.
   */
  table?: { queryKey: QueryKey; fetch: () => Promise<ArticleListSnapshot> };
}

interface PendingRefresh {
  queryKey: QueryKey;
  hash: string;
  data: ArticleListSnapshot;
  count: number;
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
  // 크롤 시작 순간에 고정한 저장본 나이 판정 — null = 새 자료 (서버 응답이 캐시를 덮어도 바뀌지 않음)
  const staleLabelRef = useRef<string | null>(null);
  const [staleLabel, setStaleLabel] = useState<string | null>(null);
  // 새 자료 크롤 뒤 따로 받아 둔 새 목록 — "새 매물 반영" 버튼을 누르면 표에 넣는다
  const [pending, setPending] = useState<PendingRefresh | null>(null);
  const tableRef = useRef(options.table);
  useEffect(() => {
    tableRef.current = options.table;
  });

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

  // 새 자료 크롤 종료 — 지금 표와 같은 조건으로 새 목록을 따로 받아 비교 (표 캐시는 건드리지 않음)
  const checkTableChanges = useCallback(async () => {
    const table = tableRef.current;
    if (!table) return;
    const current = queryClient.getQueryData<ArticleListSnapshot>(table.queryKey);
    try {
      const next = await table.fetch();
      const diff = diffArticleLists(current, next);
      if (diff.changed) {
        setPending({ queryKey: table.queryKey, hash: hashKey(table.queryKey), data: next, count: diff.count });
      }
    } catch {
      // 비교용 목록을 못 받으면 표는 그대로 둔다 — 표 쿼리는 낡음 표시가 돼 있어
      // 다른 페이지·필터로 옮기거나 "데이터 갱신"을 다시 누르면 서버에서 새로 받는다
    }
  }, [queryClient]);

  const startPolling = useCallback(() => {
    clearPolling();
    consecutiveErrorsRef.current = 0;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const status = await getCrawlStatus(complexNo);
        consecutiveErrorsRef.current = 0;
        if (status.status === "running") {
          // 진행률 문구 실시간 갱신 + progress 객체를 CrawlMessage(한 줄 안내)에 전달
          setMsg(buildProgressMessage(status), "info");
          setProgress(status);
          // 매 3 폴링(6초) 마다 조용히 articles 갱신 — articles/details/enriching 전 phase
          // BE 가 페이지당 커밋 + 캐시 delete 하므로 전 phase refetch 가 의미 있음
          // 새 자료면 카드 쿼리 하나만 — 표는 받는 동안에도 건드리지 않는다 (세션 447)
          if (attempts % 3 === 0) {
            if (staleLabelRef.current) {
              queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
            } else {
              queryClient.invalidateQueries({ queryKey: queryKeys.articles(complexNo, undefined), exact: true });
            }
          }
          return;
        }
        if (TERMINAL_STATUSES.has(status.status)) {
          clearPolling();
          const stale = staleLabelRef.current;
          if (status.status === "error") {
            setCrawling(false);
            setProgress(null);
            setStaleLabel(null);
            // 🚨 refetch/invalidate 호출 금지 — 기존 저장 데이터를 그대로 유지
            //    사용자가 X 눌러 배너 닫을 때까지 메시지 유지 (자동 사라짐 X)
            setMsg(stale ? `${stale} — 지금은 새로 못 받았어요` : NAVER_BLOCKED_MESSAGE, "error");
            return;
          }
          if (stale) {
            // 낡은 자료 — 지금처럼 표까지 다시 받아 자동 교체
            refetchComplexQueries(queryClient, complexNo);
          } else {
            refetchNonTableQueries(queryClient, complexNo);
            await checkTableChanges();
          }
          setCrawling(false);
          setProgress(null);
          setStaleLabel(null);
          if (status.status === "done_partial") {
            setMsg(PARTIAL_DONE_MESSAGE, "success");
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
  }, [complexNo, queryClient, clearPolling, setMsg, checkTableChanges]);

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
      // 판정은 시작 순간의 articles_crawled_at 으로 고정 — 뒤이은 patchLastCrawledAt 이 덮어도 그대로
      const complex = queryClient.getQueryData<Complex>(queryKeys.complex(complexNo));
      const label = staleLabelFor(complex?.articles_crawled_at);
      staleLabelRef.current = label;
      setStaleLabel(label);
      setPending(null);
      setCrawling(true);
      setProgress(null);
      setMsg(START_MESSAGE, "info");
    },
    onSuccess: (result: CrawlProgress) => {
      if (result.status === "cached") {
        // 서버가 쿨다운으로 스킵 — 캐시 즉시 패치로 배지 빠르게 갱신
        patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at, result.articles_crawled_at);
        setCrawling(false);
        setProgress(null);
        setStaleLabel(null);
        // 서버가 돌려준 매물 받은 시각으로 다시 판정 (세션 448) — 낡았으면 다시 받을 것이 없으니
        // 표·카드는 그대로 두고 나이만 알린다 ("갱신됨" 초록 문구 안 띄움, × 로 닫을 때까지 유지)
        const cachedStale = staleLabelFor(result.articles_crawled_at);
        if (cachedStale) {
          setMsg(`${cachedStale} — 지금은 새로 못 받았어요`, "error");
          return;
        }
        refetchComplexQueries(queryClient, complexNo);
        const ago = formatAgo(result.articles_crawled_at);
        setMsg(ago ? `${ago} 갱신됨` : "최근 갱신됨", "success");
        timersRef.current.push(setTimeout(() => setMessage(""), 4_000));
        return;
      }
      if (result.status === "already_running") {
        // 다른 화면·자동 크롤이 시작한 크롤이 서버에서 이미 도는 중.
        // setCrawling 은 건드리지 않는다(종료 시점 해제는 폴링이 맡는다).
        // 문구는 기존 onError 409 분기와 톤 통일 — 사용자 입장에서 동일 상황.
        setMsg("이미 크롤링이 진행 중입니다.", "info");
        // 이 화면에서 폴링이 안 돌고 있으면(새로 열어 남의 크롤을 만난 경우) 끝날 때까지 지켜본다 —
        // 안 그러면 흐림·나이 안내가 풀리지 않는다 (세션 448). 이미 돌고 있으면 interval 중복 금지.
        if (!pollRef.current) startPolling();
        return;
      }
      // started 분기 — 서버가 돌려준 현재 last_crawled_at 즉시 반영(이전 시각)해서
      // 갱신 시작 순간에도 배지 표시가 어긋나지 않게 함. 진짜 "방금 전" 은
      // 폴링의 done 수신 후 refetch 로 교체.
      patchLastCrawledAt(queryClient, complexNo, result.last_crawled_at, result.articles_crawled_at);
      // 서버 상태를 2초 간격 폴링 → terminal 신호 수신 시 종료
      startPolling();
    },
    onError: (err: unknown) => {
      clearPolling();
      setProgress(null);
      setStaleLabel(null);
      // 낡은 자료였으면 "N일 전 자료예요 — 지금은 새로 못 받았어요" (429·403·401·409 는 기존 문구·동작)
      const failText = staleLabelRef.current
        ? `${staleLabelRef.current} — 지금은 새로 못 받았어요`
        : NAVER_BLOCKED_MESSAGE;
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
          setMsg(failText, "error");
        }
      } else {
        setMsg(failText, "error");
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

  // 표 조건(페이지·필터)이 바뀌면 받아 둔 새 목록은 버린다 — 새 조건은 서버에서 새로 받는다
  const tableHash = options.table ? hashKey(options.table.queryKey) : null;
  if (pending && pending.hash !== tableHash) setPending(null);

  const applyPendingRefresh = useCallback(() => {
    if (!pending) return;
    queryClient.setQueryData(pending.queryKey, pending.data);
    setPending(null);
  }, [pending, queryClient]);

  return {
    crawling,
    message,
    messageType,
    progress,
    /** 크롤 중이고 저장본이 낡았으면 나이 안내 글, 아니면 null */
    staleLabel,
    /** 새 자료 크롤 뒤 표와 달라진 게 있으면 { count }, 없으면 null */
    pendingRefresh: pending ? { count: pending.count } : null,
    applyPendingRefresh,
    setMsg,
    clearMessage,
    handleCrawl,
  };
}
