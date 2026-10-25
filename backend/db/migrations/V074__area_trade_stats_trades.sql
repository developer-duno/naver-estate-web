-- V074: 면적별 정부 실거래 표에 거래 하나하나 목록 칸 trades 추가 (세션 479 B29 PR a, 사장님 승인 2026-10-25)
--
-- 설계 = 메모리 scripts/s479_design-b29-range-price.md §2-1 · 사장님 지적 "집 가격을 중위값 하나로 보여 주지 말 것"
--
-- 무엇:
--   * complex_area_trade_stats.trades — 그 달·그 묶음 거래 하나하나(가격 · 거래일 · 층 · 거래방식).
--     한 원소 = {"p": 만원, "d": "YYYY-MM-DD", "f": 층, "g": "중개거래" | "직거래" | null}, 거래일 오름차순(d 없는 거래는 뒤).
--     prices 와 같은 거래(해제 제외)다. 적재 = crawler/service_public.py 주간 수집·소급이 prices 와 같이 쓴다(외부 호출 수 변화 0).
--
-- 왜: 화면이 "중위 한 값" 대신 범위 + 거래 목록(층·거래일)을 보여 주려면 거래 단위 자료가 필요하다.
--   prices 는 가격만 있어 층·날짜·직거래 여부를 알 수 없다. prices·price_min·price_max·trade_count 뜻은 그대로다.
--
-- 공유 DB(mibunyang) 영향: 2u 소유 표에 칸 추가만(기존 칸 타입·값 변화 0). 칸 추가는 권한 지문 밖 → 기준선 재승인 불필요.
--   권한·RLS·정책은 V073 그대로.
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 어긋나면 RAISE EXCEPTION → 전부 취소된다.
--   적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만).
--   잠금 대기 상한: 칸 추가는 표를 잠깐 잠근다 — 수집 잡이 쥐고 있으면 기다리지 않고 실패(한가한 시각에 다시 실행). V073 관례.
--
-- 순서(운영 선행 적용 필수): 서버 코드가 이 칸에 쓴다. 칸이 없으면 주간 수집·소급의 면적별 저장이 실패하므로
--   **이 파일을 운영에 먼저 적용한 뒤** 머지·재시작한다(V073 관례).

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.complex_area_trade_stats ADD COLUMN IF NOT EXISTS trades jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.complex_area_trade_stats.trades IS
  '그 달·그 묶음 거래 하나하나 — [{"p":만원,"d":"YYYY-MM-DD","f":층,"g":"중개거래"|"직거래"|null}] 거래일 오름차순(d null 은 뒤). prices 와 같은 거래(해제 제외). 층·날짜를 못 읽은 거래는 f·d null · g 는 dealingGbn 원문';

-- 자체검사 — 어긋나면 전부 취소
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'complex_area_trade_stats' AND column_name = 'trades'
  ) THEN
    RAISE EXCEPTION 'complex_area_trade_stats self-check: trades column missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- ⚠ 서버 코드가 이 칸에 쓰므로 지우기 전에 코드를 먼저 되돌린다. 칸을 지우면 거래 목록도 사라진다(주간 수집이 24달을 다시 받으며 채운다).
-- ALTER TABLE public.complex_area_trade_stats DROP COLUMN IF EXISTS trades;
