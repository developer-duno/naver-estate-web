-- V068: kapt_complex_map 에 "관리비 미공개 확인 시각" 칸 추가 (세션 426, 사장님 결정 2026-10-01)
--
-- 왜: 관리비 수집(crawler/service_kapt.py collect_kapt_costs)은 후보월이 전부 빈 응답인
-- 단지(= 그 달 미공개)를 "정상 데이터 없음" 으로 세기만 하고 어디에도 기록하지 않았다.
-- 그래서 같은 미공개 단지를 매 회차(하루 2번) 대기열 맨 앞에서 다시 훑었다.
-- 운영 실측(2026-10-01 12:40 회차): 수집 180 · 미공개 283 · 호출 4,818 중 미공개 283단지가
-- 849콜(18%)을 썼다. 호출 간격 1.5초라 회차당 약 4,800콜이 한계인데, 그 몫을 같은
-- 미공개 단지가 매번 먹으면 정작 받을 수 있는 단지에 못 닿는다.
--
-- 이 칸의 뜻: 그 단지를 마지막으로 "후보월 전부 미공개" 로 확인한 시각(UTC).
--   * 미공개로 확인되면 회차 시작 시각으로 찍는다.
--   * 수집에 성공하면 NULL 로 지운다.
--   * 호출 실패(오류)는 건드리지 않는다(미공개가 아니라 모르는 상태이므로).
--   * 수집기는 이 시각이 7일 안이고 같은 달(UTC 연·월)이면 그 단지를 건너뛴다.
--     달이 바뀌면 후보월이 바뀌므로 다시 확인한다.
-- 인덱스는 만들지 않는다 — 수집기가 14,747행 전체를 어차피 읽는다.
--
-- 공유 DB(mibunyang) 영향 0:
--   * nullable 칸 추가라 기존 행·기존 쿼리 동작 변화 0.
--   * mibunyang 은 kapt_complex_map 을 코드에서 읽거나 쓰지 않는다(문서 언급만).
--   * 매달 매칭(match_kapt_complexes)은 _do_upsert 로 넘긴 칸만 갱신하므로, 같은 짝 재확인에서는
--     이 칸을 지우지 않는다. 짝(kapt_code)이 바뀌면 _clear_conflicting_mappings 가 이 칸을 NULL 로
--     지운다(새 짝은 다시 확인하는 게 맞다). 처음 매칭돼 행을 새로 만들 때는 NULL 로 시작한다.
--   * 표·정책·GRANT 를 바꾸지 않으므로 mibunyang 권한 지문 기준선 재승인 대상이 아니다.
--
-- ⚠ 코드보다 운영 선행 적용 필수 (V034·V058 관례):
-- ORM(db.models.KaptComplexMap)에 매핑된 칸은 KaptComplexMap 을 SELECT 하는 모든 경로의
-- 칸 목록에 들어간다. 운영 DB 에 칸이 없는 채로 새 코드가 뜨면 관리비 수집·매칭·단지 상세
-- 관리비 조회에서 UndefinedColumn 500 이 난다. SQLite CI 는 create_all() 이 칸을 자동으로
-- 만들어 이 누락을 못 잡는다. 배포 순서: ① 본 파일 운영 적용 → ② 코드 머지·재시작.
-- ADD COLUMN IF NOT EXISTS 라 멱등·재실행 안전.
ALTER TABLE kapt_complex_map ADD COLUMN IF NOT EXISTS cost_blank_checked_at TIMESTAMPTZ;
COMMENT ON COLUMN kapt_complex_map.cost_blank_checked_at IS
  '관리비 후보월이 전부 미공개로 확인된 마지막 시각(UTC) — 세션 426. 수집 성공 시 NULL 로 지움. 7일 안·같은 달이면 수집기가 그 단지를 건너뛴다.';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- 순서: 코드 되돌림·재시작 확인 → (필요하면) DROP. 새 코드가 떠 있는 채 칸을 지우면 단지 화면
-- 관리비 조회가 500 이 된다. 칸은 남겨 둬도 옛 코드에 무해하다(옛 코드는 이 칸을 읽지 않는다).
-- ALTER TABLE kapt_complex_map DROP COLUMN IF EXISTS cost_blank_checked_at;
--
-- 런북: 파서 결함 등으로 공개된 단지까지 전부 미공개처럼 보였다면, 결함을 고쳐 배포한 뒤
-- 기록을 한 번에 지워 다음 회차가 전부 다시 확인하게 한다:
-- UPDATE kapt_complex_map SET cost_blank_checked_at = NULL;
