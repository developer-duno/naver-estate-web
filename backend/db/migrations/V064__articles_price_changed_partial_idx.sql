-- V064: articles 가격 변동 조회 부분 인덱스 (/api/articles/price-changes 5초 — 세션 417)
--
-- 배경: `GET /api/articles/price-changes` (routers/articles.py:32,
-- db/price_queries.py:181 get_price_changed_articles) 가 아래 쿼리를 그대로 실행한다.
--   WHERE is_active = true AND price_changed_at IS NOT NULL [AND complex_no = ?]
--   ORDER BY price_changed_at DESC LIMIT n
--
-- 조사반 C 실측 (EXPLAIN ANALYZE, 세션 417): Parallel Seq Scan, **4.2~5.5초**,
-- 매칭 3,039건 / 전체 1,490,000행(articles 149만 행 규모). price_changed_at 에
-- 인덱스가 없어(pg_indexes 로 본 워크트리에서 읽기 전용 확인 — 0건) planner 가
-- 테이블 전체를 훑고서야 정렬·LIMIT 을 적용한다.
--
-- 처방 = V057·V061 과 같은 패턴(WHERE 상수 조건으로 부분 인덱스). 이 쿼리가 찾는
-- population(활성 + 가격변동 이력 있음, 3,039건)이 정확히 인덱스 조건과 일치하므로
-- ORDER BY price_changed_at DESC 를 인덱스 자체의 정렬로 흡수해 Index Scan Backward
-- + LIMIT 로 상위 n건만 읽고 끝난다(테이블 스캔 자체가 사라짐).
--
-- 기대: EXPLAIN 이 Parallel Seq Scan → Index Scan Backward using
-- ix_articles_price_changed_active 로 바뀌고, Execution Time 이 수 ms 대로 감소.
--
-- 크기 추정: 매칭 3,039건 규모의 부분 인덱스라 매우 작다(V057 ix_articles_detail_pending·
-- V061 ix_articles_field_drift_window 와 동일 계열 — 수백 KB~수 MB 수준, articles
-- 테이블(수백 MB) 대비 무시 가능).
--
-- complex_no 조건이 붙는 경로(관리자·단지 상세에서 특정 단지의 가격변동만 조회)는
-- 이 인덱스에 넣지 않는다 — 기존 `ix_articles_complex_active (complex_no, is_active)`
-- 인덱스가 이미 그 조건(complex_no + is_active)을 담당해 해당 단지의 매물만 빠르게
-- 좁히고, 그 이후 정렬 대상은 단지당 매물 수가 적어(전체의 극히 일부) 인메모리 정렬로
-- 충분하다. 복합 인덱스를 추가로 만드는 비용 대비 이득이 없다.
--
-- 기존 데이터 영향 0: 신규 인덱스 추가일 뿐, 쿼리 결과·다른 경로는 무영향.
-- 공유 DB(mibunyang) 도 articles 에 upsert 하지만(naver 수집기) V038·V061 선례와
-- 동일하게 저빈도 upsert 라 인덱스 유지 오버헤드 미미.
--
-- articles 는 대형(149만 행)이므로 **CONCURRENTLY** 로 생성해 ACCESS EXCLUSIVE 락을
-- 피한다. CONCURRENTLY 는 트랜잭션 블록 안에서 실행 불가 — Supabase SQL Editor 등
-- 자동커밋 모드에서 단일 statement 로 실행할 것 (BEGIN/COMMIT 으로 감싸지 말 것).
--
-- 코드 변경 불필요 — 쿼리(db/price_queries.py get_price_changed_articles)는 이미
-- 이 조건 그대로 실행 중이라 인덱스 적용 즉시 다음 요청부터 빨라진다.

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_articles_price_changed_active
ON articles (price_changed_at DESC)
WHERE is_active = true AND price_changed_at IS NOT NULL;

-- 역방향 (롤백):
-- DROP INDEX CONCURRENTLY IF EXISTS ix_articles_price_changed_active;
