-- V058: complexes 에 도장 컬럼 2개 추가 (크롤 선정 키 오염 근본수정, 세션 402)
--
-- 왜 기존 complexes.last_crawled_at 을 선정 키로 못 쓰는가 (본 마이그레이션의 핵심):
-- 이 컬럼은 "우리가 이 단지 매물 목록을 언제 긁었나"를 뜻하도록 만들어졌지만, 지금은
-- 두 갈래로 오염돼 그 뜻을 잃었다.
--   (1) 자매 프로젝트 일괄 스탬프 — mibunyang 이 2026-09-09 23:00 UTC 에 bbox 마커로
--       30,328건을 한꺼번에 찍었다(F:/mibunyang/scripts/collectors/naver-collect.py:478).
--       그 단지들은 우리가 긁은 적이 없는데도 "방금 긁은 단지"로 보인다.
--   (2) 우리 오류 경로 스탬프 — crawl_complex_articles 는 네이버 목록 API 가 1페이지에서
--       오류를 답해도 break 후 last_crawled_at 을 찍는다. 즉 "긁기 실패"가 "긁음"으로
--       기록된다.
-- prod 실측(2026-09-13): complexes 64,148 중 활성 매물 0 인데 last_crawled_at 이 있는
-- 단지가 38,659건. 반대로 활성 매물 보유 단지 10,567 중 76%(8,066)가 마지막 목격
-- 30일 이상 경과 — 선정 키가 오염돼 정작 살아있는 단지에 못 닿고 있다.
--
-- 두 컬럼의 의미 (둘 다 last_crawled_at 과 별개이며, 자매도 오류도 못 찍는다):
--   * articles_crawled_at — **우리** 목록 크롤이 **완주**한 시각. 완주 = 1페이지가 정상
--     응답(dict 에 error 없음)이고 마지막 페이지까지 오류 0. 빈 목록도 완주다(단지가
--     실제로 매물 0 인 것은 정상 결과). 오류로 중간에 끊기면 안 찍힌다 → 배치 선정의
--     "오래된 것 우선" 순환 키로 쓸 수 있는 유일한 시각.
--   * last_viewed_at — 사용자가 단지 화면에서 start-crawl 을 호출한 시각(= 사람이 그
--     단지를 봤다). 인기 크롤 선정 키. 옛 인기 크롤은 last_crawled_at DESC 로 뽑아
--     "방금 배치가 긁은 단지"를 다시 긁었다(7일 1,050회 중 81%가 중복 — 세션 402 실측).
--
-- 공유 DB(mibunyang) 영향 0:
--   * nullable 컬럼 추가라 기존 행·기존 쿼리 동작 변화 0.
--   * mibunyang 은 이 두 컬럼을 읽지도 쓰지도 않는다.
--   * mibunyang 의 complexes 쓰기는 `ub("complexes", ...)` 형태의 **명시 컬럼 dict**
--     upsert(PostgREST merge-duplicates)라, 자기가 모르는 컬럼을 NULL 로 밀어버리지
--     않는다(V053~V057 에서 반복 확인한 것과 같은 구조).
--
-- ⚠ 코드보다 prod 선행 실행 필수 (V034 관례 · V055 헤더와 동일 취지):
-- ORM(db.models.Complex)에 매핑된 컬럼은 Complex 를 SELECT 하는 **모든** 경로의 컬럼
-- 목록에 포함된다. prod 에 컬럼이 없는 채로 새 코드가 뜨면 UndefinedColumn 500 이
-- 단지 검색·단지 상세·크롤 전 경로에서 터진다. SQLite CI 는 create_all() 이 컬럼을
-- 자동 생성해 이 누락을 못 잡는다. 배포 순서: ① 본 파일 prod 실행 → ② 코드 머지·재시작.
-- ADD COLUMN IF NOT EXISTS 라 멱등·재실행 안전.
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS articles_crawled_at TIMESTAMPTZ;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;
COMMENT ON COLUMN complexes.articles_crawled_at IS
  '우리 매물 목록 크롤이 **완주**한 최종 시각 — 1페이지 정상 응답 + 마지막 페이지까지 오류 0 일 때만 찍힌다(빈 목록도 완주). 세션 402. 자매 mibunyang 의 일괄 스탬프와 우리 오류 경로에 오염된 last_crawled_at 을 대신하는 배치 선정 순환 키.';
COMMENT ON COLUMN complexes.last_viewed_at IS
  '사용자가 단지 화면에서 start-crawl 을 호출한 최종 시각(= 사람이 그 단지를 봤다) — 인기 크롤 선정 키. 세션 402. cached/already_running/force 어느 경로로 끝나든 찍힌다(호출 자체가 "봤다"의 증거).';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE complexes DROP COLUMN IF EXISTS articles_crawled_at;
-- ALTER TABLE complexes DROP COLUMN IF EXISTS last_viewed_at;
