-- V030: trades 중복 인덱스 3개 제거 (~57MB 회수 + INSERT 갱신 부담 감소)
--
-- 근거 (세션 260 라이브 pg_stat_user_indexes + EXPLAIN 실측):
--   region+gu 조회 시 planner 가 idx_trades_region_gu_dong(region,gu,dong 3컬럼)만 선택.
--   아래 3개는 모두 idx_scan=0 + 정의가 다른 인덱스와 중복:
--     - idx_trades_region        (region, gu)        → region_gu_dong 가 prefix 로 커버
--     - idx_trades_region_gu     (region, gu)        → idx_trades_region 과 완전 동일 (V015 중복 생성)
--     - idx_trades_month         (deal_month)        → idx_trades_deal_month(deal_month DESC) 가
--                                                       backward scan 으로 ASC/DESC 모두 커버
--
-- ⚠️ 절대 제거 금지 (idx_scan=0 이어도 필수):
--     - idx_trades_unique  : collect-trades upsert 의 ON CONFLICT 타겟. 제거 시 실거래 중복 폭증.
--     - trades_pkey        : PRIMARY KEY (테이블 무결성).
--   유지: idx_trades_deal_month(925 scans), idx_trades_cancel, idx_trades_region_gu_dong.
--
-- trades 는 mibunyang 공유 테이블 (세션 254 공유인프라 규칙). 위 3개는 mibunyang/naver 양쪽
--   코드에서 사용 흔적 없음 확인 (region_gu_dong 가 모든 region+gu 조회를 커버).
--
-- 실행 방법: Supabase SQL Editor 수동 실행 (마이그레이션 자동 러너 없음). DROP INDEX 는
--   트랜잭션 안전. 큰 락 없음 (인덱스 삭제는 ACCESS EXCLUSIVE 이나 순간).

DROP INDEX IF EXISTS idx_trades_region;
DROP INDEX IF EXISTS idx_trades_region_gu;
DROP INDEX IF EXISTS idx_trades_month;

-- 역방향 (롤백):
--   CREATE INDEX idx_trades_region ON trades (region, gu);
--   CREATE INDEX idx_trades_region_gu ON trades (region, gu);
--   CREATE INDEX idx_trades_month ON trades (deal_month);
--
-- 적용 확인:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'trades' ORDER BY indexname;
--   기대: idx_trades_region / idx_trades_region_gu / idx_trades_month 부재.
