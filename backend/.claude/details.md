# Backend 깊이 자료

> 본 파일은 명시 참조 자료. 진입점 = `backend/CLAUDE.md` §토픽 인덱스.

## 실거래가 on-demand 수집 (live.py)

| 엔드포인트 | 메서드 | 인증 | 설명 |
|-----------|--------|------|------|
| `/{no}/price-history/start-collect` | POST | admin/expert | 수집 시작 (24시간 TTL, Semaphore 3, 쿼터 제한) |
| `/{no}/price-history/collect-status` | GET | 없음 | 진행 상태 폴링 |

- 24시간 내 수집 데이터 있으면 `{"status": "fresh"}` 반환 (수집 스킵)
- 백그라운드 스레드에서 `collect_price_history_for_complex()` 호출
- on-demand 전용 throttle: `_throttle_ondemand` (min 2.0s, 스케줄러와 분리)
- 수집 중 실시간 진행률: `on_progress` 콜백으로 collected/failed/total 업데이트
- 완료 시 `_price_history_cache` 캐시 무효화 (delete_by_prefix)

## mibunyang 통합 (Phase 1.5 — 읽기 + 정렬/검색)

- 같은 Supabase DB 공유 → 기존 `Base`/`SessionLocal`/`get_db()` 그대로 사용
- `db/mb_models.py`: mibunyang 10개 테이블 ORM (Apartment, UnsoldHistory, MBRegion, MBTrade 등)
- `db/mb_queries.py`: 읽기 쿼리 + 정렬/검색 헬퍼
  - `_build_mb_order_clause(sort_by)`: 아파트 동적 정렬 (9개 옵션, nullable 컬럼 NULLS LAST)
  - `_build_mb_trade_order_clause(sort_by)`: 실거래 동적 정렬 (5개 옵션, 전 키 NULLS LAST)
  - `_apply_keyword_filter(conditions, keyword)`: 단지명 ILIKE 검색 (%/_ 이스케이프)
- `routers/mb.py`: `/api/mb/*` 엔드포인트 (인증 없는 공개 API)
  - `/apartments`: `sort_by` (Literal[9]), `keyword` (min_length=2, max_length=100)
  - `/unsold`: `sort_by` (Literal[9]), `keyword`
  - `/trades`: `sort_by` (Literal[5])
  - `MbAptSortBy`, `MbTradeSortBy` Literal 타입 정의
- mibunyang 테이블: apartments(97col), unsold_history, regions, trades, prices, trade_stats, builders, infra, schools, transport
- 컬럼명 매핑: `lat`→`latitude`, `lng`→`longitude` (mapped_column alias)

## 공인중개사 검증 워크플로 (B2B 구독 모델)

```
/verify (FE) → POST /api/verify (sangji 사업자번호 10자리)
  ↓
business_api.py (국세청 odcloud API: api.odcloud.kr/api/nts-businessman/v1/validate)
  ↓ 성공
db/models.py agent_verifications.verification_status = "approved"
users.role = "expert" (자동 승인)
  ↓ 실패
verification_status = "pending"
  → 자격증 업로드 (services/storage.py: Supabase Storage, 5MB JPG/PNG/PDF)
  → /admin/users 관리자 수동 승인/거부 (routers/admin/users.py)
  → services/email.py Gmail SMTP SSL 465 알림 (best-effort)
```

- 핵심 모듈 7종: `routers/verify.py` + `routers/admin/users.py` + `crawler/business_api.py` + `crawler/vworld_client.py` + `services/storage.py` + `services/email.py` + `db/models.py` (`agent_verifications` 테이블)
- **V-WORLD 중개사 대조 (세션 308 PR B)**: 국세청은 "사업자 진위+영업중"만 봐서 식당·카페도 자동승인되는 구멍 → `crawler/vworld_client.py` `search_broker_office`(getEBOfficeInfo)로 "진짜 중개사무소"인지 실시간 대조. 게이트 = 국세청진위 AND 영업중 AND V-WORLD매칭(영업중)→approved, 미매칭/휴폐업/조회실패→pending(false negative 방어). 결과는 `broker_verified`/`broker_jurirno`/`broker_status`(V034) 정식 컬럼에 저장.
- 환경변수 (backend/.env): `PUBLIC_DATA_API_KEY` (odcloud), `VWORLD_API_KEY`+`VWORLD_DOMAIN` (V-WORLD 중개사 대조, 미설정 시 대조 skip→pending), `SMTP_HOST/PORT/USER/PASS/FROM` (Gmail)

## 미분양 중복 제거

- `extract_base_name()` — 단지명에서 차수 접미사 제거 ("푸르지오(3차)" → "푸르지오")
- `_deduplicate_apartments()` — (base_name, region, gu) 그룹에서 마지막 차수만 유지
- `get_apartments_page()` — 목록+total 단일 쿼리 반환 (기존 `get_apartments` + `count_apartments` 통합)
- `apartment_to_dict()` — name 필드에서 차수 접미사 자동 제거

## 스케줄러 잡 상세 (infra.md 표에서 옮겨 온 원문 — 세션 411)

> `.claude/rules/infra.md` §스케줄러 표의 여섯 잡(매물 상세 보강·공동주택 공시가격·응급의료·K-apt 단지 매칭·
> data.go.kr API 버전 감시·크롤링 모니터)을 파고들 때 읽는 원문. 표는 훑어보는 용도, 여기는 파고드는 용도.
> 세션 408 에 표 칸에서 infra.md 하단으로, 세션 411 에 이 파일로 옮겼다 — **내용은 그대로이고 자리만 옮겼다**
> (규칙 파일은 세션·서브에이전트마다 통째로 읽히므로, 깊은 원문은 명시 참조 파일에 둔다).
> 표 행의 `§잡 상세 — …` 링크가 이 절을 가리킨다. **잡의 동작을 바꾸면 표와 이 절을 함께 갱신**한다.

### 잡 상세 — 매물 상세 보강

**주기**: 30분 interval **+ jitter 900초**(±15분 무작위 — 같은 IP 네이버 요청 분산,
`scheduler.py` `jitter=900`). ⚠ **실제 실행 간격은 15~45분**이라 "정확히 30분마다"로
기대하면 오판한다 — 세션 395 실측: 01:14 부팅 → 첫 실행 01:58.

매물 상세 정보 크롤링 (배치 500, PR #19 답습 ~27일 완주 일정. 2026-05-25 세션 229 실측 = 5일 진행 시 active 570,126건 중 23,019건(4.0%) detail_crawled. 배치당 dead 매물(404 빠른 응답) ~85% 답습 — "27일 완주 63.8만 건" 모집단과 "active 4.0%" 모집단은 다름. **매물 단위 오류 상한**: 네이버가 그 매물에 한정해 dict 오류(code 가 NotExistInformation 이 아닌 것, 예 `ERROR`/"알수없는 오류(시스템 오류)")를 답하면 `articles.detail_fail_count` 를 올리고, `_DETAIL_FAIL_CAP`(6 ≈ 3시간) 도달 시 선정 쿼리에서 제외해 무한 재시도를 끊는다(V056·세션 395 — is_active 는 불변, 문자열 오류=전체 장애는 카운트 제외. **배치(≥20)가 전수 매물오류인 회차는 카운트 보류** — 네이버가 봇 의심 세션에 모든 매물로 HTTP 200+dict 오류를 일괄 반환하는 소프트 차단을 살아있는 매물의 개별 결함으로 오인하지 않기 위함). **(일일 정비 잡이 하루 1회 재시도 자격 부여 — 위 정기 VACUUM 유지보수 행 참조)**) **쓰기 순회마다 commit**(세션 396 PR #487) — 옛 "50건마다 commit" 은 UPDATE 행 잠금을 throttle 1.5s 대기 동안 최대 50건×1.5s≈75초 쥐어, 같은 매물을 upsert 하는 인기 크롤·12h 배치·사용자 온디맨드 크롤이 8초 statement_timeout 에 잘렸다(2026-09-09 14:45 complex_articles 13건 failed 의 **유력 기전 — 정황은 강하나 pg_locks 직접 증거는 미확보**, 재발 시 잠금 외 원인도 조사). 온디맨드 워커(`routers/live/_detail_worker.py`)·단지 상세 backfill 도 동일 전환. 네이버 호출 간격은 불변. **후보 SELECT 부분 인덱스 V057**(세션 400, PR #497): 대기 매물이 실질 0 으로 수렴한 뒤 LIMIT 조기 종료가 불가능해져 매회 articles 149만 행·636MB 전량 스캔(81,480 buffers·디스크 290MB·37회/일 — shared_buffers 512MB 의 절반을 상시 축출)이던 것을 `ix_articles_detail_pending (last_seen_at DESC NULLS LAST) WHERE detail_crawled=false AND is_active=true` 로 전환. 2026-09-12 22:41 CONCURRENTLY 2.5초 적용·valid·16KB, 적용 후 EXPLAIN = Index Scan **Buffers 2·0.08ms**, 22:49 회차부터 라이브 사용(NullPool 이라 재시작 불필요). 옛 "인덱스 금지"(세션 266·268)는 대기 38만 국면(조기 종료 가능)의 판정이었고 지금은 전제가 반전됐다 — 대기가 다시 커져도 손해 국면 없음. ⚠ 후보 SELECT 의 술어·정렬을 바꾸면 인덱스가 조용히 죽는다 — `tests/test_migration_v057_detail_pending_idx.py` 가 실행 SQL 을 캡처해 대조하니 바꿀 땐 인덱스도 함께(새 마이그레이션).

### 잡 상세 — 공동주택 공시가격 수집

**주기**: 매월 15일 06:30

V-WORLD getApartHousingPriceAttr 법정동 전량 수집 → 단지(APT·JGC) 세대수 게이트 매칭 → 평형별 중위 공시가격 저장 (네이버 0, VWORLD_API_KEY 공유, 토글 OFFICIAL_PRICE_ENABLED — PR-A3). ⚠ 정상 소요 3.6~7h — 실행 중(15일 06:30~오후) 재시작 회피(잡이 프로세스 내 상주라 재시작=중단). 체크포인트 재개는 중단 후 **72h 이내 재실행(수동 재트리거)만** 유효(#387 신선도 바운드, 3개 수집기 공통) — 놓치면 익월 정기 실행이 처음부터 전량 재수집(데이터 무손실, 시간 낭비만) (세션 369·370). V-WORLD 페이지네이션 드리프트(총행수 일치·행 구성 상이)로 대형 단지가 세대수 게이트에서 비결정 탈락 → 본 루프 종료 후 **매칭 소실 재수집 패스**가 새 표본으로 구제, 잔여는 completed 잡의 error_message 에 기록 + **잔여·붕괴(소실 200단지 초과)는 텔레그램 알림**(세션 370). 재수집 패스는 벽시계 1h 캡(`_REPASS_MAX_SECONDS`, 초과분은 잔여 보고 합류) — 재수집 구간에서 강제종료되면 체크포인트가 이미 지워진 뒤라 재실행이 전량 재수집이 되나 데이터 무손실이라 수용(세션 371). **재수집은 동마다 최대 3회 표본(`_REPASS_MAX_ATTEMPTS`)을 떠서 호 키 합집합으로 판정한다(세션 413)** — 드리프트는 "같은 총행수, 다른 호 부분집합"이라 표본마다 빠뜨리는 호가 달라, 각각은 게이트 탈락인 표본도 합치면 통과한다. 2026-09-17 라이브 프로브(연속 3회 조회): 은마(4,424세대, 하한 4,203) 유니크 호 **4,356 통과 / 3,597 탈락 / 3,199 탈락 — 누적 합집합 4,424(100%)**, 단지 127894(1,725세대) **1,725 / 1,530 / 1,405 — 합집합 1,725(100%)**. 단발 통과율이 ~1/3 이라 2회로는 합집합 성공률이 ~95% 에 걸쳐 3회로 잡았다. 누적이 곧 합집합인 이유 = 세대수 게이트(`group["ho_keys"]`)도 저장 집계(`aggregate_area_medians` 의 `_ho_key` dedupe)도 **키 기반**이라 여러 표본의 행을 이어붙여 재색인하면 그 자체가 호 키 합집합이다(행 중복 무해). **그 동의 대상이 전부 구제되면 즉시 중단**하므로 평시(첫 재조회로 구제) 호출 수는 종전과 같은 1회이고, 벽시계 캡은 동 경계뿐 아니라 **회차 사이**에서도 본다(조회 하나는 통째로 끝나 안전한 절단점 — 페이지 단위 절단 금지 원칙은 그대로). **2차(이름 부분일치)는 동당 한 번, 최종 합집합 색인에서만** 돈다 — 회차마다 돌리면 부분 표본의 느슨한 부분일치가 그룹을 선점해, 합집합이 완성된 뒤라면 1차 완전일치로 갔을 그룹을 가로챈다(1차 우선). 1차 완전일치는 붙었는데 저장 행이 0 이었던 대상(그룹 행의 면적·가격이 전부 무효)은 pending 에 남겨 **다음 회차 합집합에서 1차를 다시** 시도하되, 2차 대상에서는 계속 뺀다(종전 동작 보존 — 완전일치 그룹이 있는데 부분일치로 다른 그룹을 집으면 오매칭 위험이 더 크다). **합집합은 단조 증가라 게이트 위쪽 경계와 상호작용한다** — 공시측 진짜 유니크 호수가 우리 세대수보다 5% 넘게 많은 단지는, 예전이라면 불완전 표본이 우연히 [0.95,1.05] 안에 떨어져 통과할 수 있었지만 이제는 통과하지 못한다. **의도된 동작**이다(옛 통과는 결손 데이터에 게이트를 통과시킨 것이고 저장되는 평형·중위값도 그만큼 결손이었다). 그런 단지는 미구제 진단 줄에 1.05 초과 비율이 찍혀 보이므로 이름·세대수 쪽을 고친다 — ⛔ 단일 표본 폴백을 다시 넣지 말 것. 또 **앞 회차에 구제된 단지는 그때의 (작은) 합집합 값으로 남는다**(pending 에서 빠져 뒤 회차가 다른 단지 때문에 합집합을 키워도 재저장하지 않음) — 차이가 이미 게이트 ±5% 안이라 중위값 영향이 미미하고, 재저장하면 "새 구제"와 "값 갱신"을 가르는 카운터가 하나 더 필요해져 수용했다. 누적은 `_extend_unique`(파이프라인이 읽는 7필드 튜플 `_row_identity` 기준)로 중복을 걸러 3회 누적이 대치동 ~147k dict 로 붓는 것을 막는다(같은 호라도 가격·면적이 다르면 보존 — 집계의 "유효한 첫 행" 성질 유지). 조회 실패 회차 뒤 다음 회차가 남았으면 본 루프 재시도와 같은 `time.sleep(2)`, 마지막 회차 뒤엔 자지 않는다. **동 하나가 끝날 때마다 커밋**한다 — 패스 전체가 best-effort try/except(+rollback) 안이라 뒤쪽 동의 예외가 앞선 동의 구제를 되돌리면 카운터(rescued 등)만 올라간 채 DB 엔 없는 상태가 된다. 구제 못 한 단지는 **단지별 진단 한 줄**(complex_no·단지명·세대수·이름 후보 그룹 수·후보별 합집합 호수와 세대수 대비 비율, 후보가 없으면 `이름 그룹 없음(개명 의심)`)을 로그에 남겨, 다음 달 실행이 "게이트를 몇 % 차이로 놓쳤나"와 "개명이라 표본을 더 떠도 소용없나"를 가를 수 있게 한다(텔레그램 문구는 무변경). **읍/면 리(里) 확장 패스**(재수집 패스 뒤, PR-E2 세션 373) — 읍/면 코드는 공시가격이 전국 공통으로 리 단위 코드에 붙어 있어 애초에 0건인 561개 읍/면(5,808단지)을, `cortar_ri_map.py`(정적 dict, 수동 재생성)로 얻은 리 코드 6,627개로 개별 조회해 회수. 리 하나하나가 독립 단위라 부분 실패가 서로 영향 없음, best-effort. **이름 2차 매칭 패스**(각 fetch 단위 안에서 1차 전량 후, PR-E3 세션 374) — 1차 완전일치가 표기 차이(괄호 차수 `성서주공(2단지)`↔`성서주공2차`·상가 접미사·동명 프리픽스)로 놓친 ~413단지+α 를 회수. 세대수 ±5% 게이트 + 후보 유일성 + claimed(선점 그룹 재사용 금지) 3중 안전장치 + 형제 단지 신호(잉여 숫자) 배제로 보수 원칙 유지, 완료 로그 `이름 2차 매칭 N개` 로 관찰. **표준코드 이관 heartbeat**(수집 시작 시 보초 **6곳** — 2026 개편맵 4곳(옛 중구·동구·서구·화성 데이터셋 대표 1곳씩) + **12-프리픽스맵 2곳**(광주 서구 화정동 1224011900·전남 순천 조례동 1215013300, 세션 391 확장) — 각 코드 1페이지 프로브, 행>0 시 텔레그램 경보 1회로 묶음. 이관되면 cortar_legacy 코드 번역이 역효과라 사람 판단으로 전환. 감지 후 맵 변경 전까진 매 실행 재경보(월 1회라 수용). **감시 범위 = 두 번역맵 전부**(VWORLD_REFORM_CORTAR_MAP·LEGACY_CORTAR_MAP) — 옛 "12-프리픽스 미감시" 백로그 해소. 보초는 반드시 **맵의 키** 쪽이어야 한다(값=표준측을 넣으면 지금도 수만 행이라 상시 오탐 — tests/test_official_price_migration_probe.py 방향 가드가 차단). 세션 375·391). **ho_count 는 유니크 호(dongNm,hoNm) 기준**(세션 376) — V-WORLD 가 호마다 완전 동일 행을 2회 반환(2026-08-22 실측: 2826011800 2,622행=1,311호×2, API totalCount 도 2배, 페이지 안에 섞여 등장, 드리프트로 1·3회도 섞임)해 원본 행 수로 세면 세대수의 2배가 저장됐었다(은마 8,848). fetch 의 `len(rows)==totalCount` 가드는 raw 기준이라 그대로 두고 집계(`aggregate_area_medians`)에서만 dedupe. 게이트와 같은 키라 `SUM(ho_count)≈세대수` 가 정상 지표(9/15 재수집 후 확인). **재수집 패스 소실 판정 2건 보강**(세션 380) — ① 리 확장 대상 읍/면 소속 단지는 소실 판정 **제외**(본루프 읍/면 조회=0건이 정상, 리 확장 패스 관할. 안 빼면 8/22 리 확장으로 올해 행을 받은 3,930단지가 9/15 에 통째로 소실 판정 → 임계 200 초과 "시스템 이상" 오탐 + 진짜 드리프트 구제 전면 생략) ② **재개(resume) 실행은 이어받은 동도 구제** — 이어받은 동(체크포인트 done) 소속 단지 중 "올해 행 보유 AND 마지막 저장 시각 < **그 동을 처음 완료한 사슬 잡의 started_at**(동별 컷오프 — 72h 내 체크포인트 보유 실패잡을 started_at 오름차순으로 훑어 체크포인트 누적 차집합으로 소유 잡 결정, 형식 변경 0)" 인 것을 소실로 합류, 사슬이 그 동에 이미 배정한 aphusCode 는 DB 에서 복원해 이중 배정 차단. 단일 "사슬 시작 min" 컷오프는 "실패 O → 완료 C 가 저장 → 실패 R 이 옛 체크포인트 상속 후 그 동을 새로 처리하다 소실 → 재개" 조합에서 C 의 저장을 "사슬이 매칭함"으로 오판해 못 줍는다(적대검증 MEDIUM 재반박 결과 동별로 정밀화). 8/22 "1차 사망 × 2차 재개" 조합에서 은마가 아무 관할에도 안 들어가 미갱신된 사각(세션 379) 해소. 리 확장 패스 자체의 드리프트 구제는 없음(리=1페이지 소규모, 완료 로그 "읍/면 리 확장 완료 N개" 월별 비교로 관찰)

### 잡 상세 — 응급의료 수집

**주기**: 매월 첫째 월 3시

NEMC 응급의료기관 API. **배치 = 전량**(`EMERGENCY_BATCH_SIZE=0`, 세션 394): 위경도 보유 2,938단지를 매월 전부 갱신한다. 전량이 가능한 근거 = 이 수집기는 **전국 기관목록을 1회만** 받고(`EmergencyAPI.get_emergency_list`) 단지별 처리는 `find_nearest`(순수 로컬 거리계산)뿐이라, **배치 크기가 외부 API 호출 수와 아무 상관이 없다** — 전량이어도 NEMC 호출은 여전히 1회라 비용 증가 0(어린이집이 "시군구당 1콜이라 쿼터 안에서 여유"였던 것보다 더 강한 조건). 옛 배치 100 은 아무 이득 없이 커버리지만 깎았다: **prod 실측 2026-09-05 — 2,938단지 중 496개(16.9%)만 emergency_hospital 이 채워지고 2,442개(83.1%)가 영구 방치**(ORDER BY 없는 `.limit(100)` 이라 DB 임의·사실상 고정 순서의 앞쪽 100개만 매월 재갱신). `infra.emergency_updated_at` 오래된 순(NULL 최우선) 순환 키(V054·세션 394)는 **안전망으로 유지** — 부분 배치로 되돌릴 때의 폴백 + 전량 실행이 도중에 끊겨도 다음 회차가 미수집분부터 이어받게 한다(500단지마다 중간 저장). Infra 행이 없는 단지(mibunyang 미수집분)는 **자동 생성**으로 전환 — 옛 skip 동작은 그 단지들을 영영 못 채워 전량 순환의 취지를 깎았다(childcare 검증 패턴 답습). **첫 실전 = 2026-09-07(월) 이미 완주·합격** — 2,938/2,938 completed(직전 8/3·7/6 은 100/100), prod `emergency_hospital` 채움 2,938 실측(세션 398). 옛 "첫 실전 = 2026-10-05" 표기는 9월 첫째 월요일을 9/1(화)로 오인한 것 — 실제로는 PR #458 머지(9/5) 직후 9/7 에 도래해 관찰 없이 지나갔다. 다음 회차 = 2026-10-05(월)

**병상·등급 필드 (세션 417 정정 — 실응답 확인 2026-09-24)**: 옛 코드는 목록 op 응답에 **없는** `hvec`·`dutyLevel` 을 읽어, 운영 DB 2,938행이 전부 `emergency_beds=0`·`emergency_level=""` 이었다(화면 "병상 수" 전 단지 "-"). 목록 op 응답 항목은 `dutyAddr·dutyEmcls·dutyEmclsName·dutyName·dutyTel1·dutyTel3·hpid·phpid·rnum·wgs84Lat·wgs84Lon` 11개뿐이다. 정정 후 필드 근거:

| op | 필드 | 뜻 | 회차당 호출 |
|---|---|---|---|
| `getEgytListInfoInqire`(목록) | `hpid`·좌표·`dutyEmclsName` | 기관 ID·위치·종별 이름(예: 지역응급의료기관, 응급실운영신고기관) → `emergency_level` | 528기관 ÷ 100 = **6콜** |
| `getEmrrmRltmUsefulSckbdInfoInqire`(실시간 가용병상) | `hvs01` | 응급실 **일반**병상 기준값(고정 수용량) → `emergency_beds` | STAGE1 없이 numOfRows=1000 **1콜**(전국 416기관) |
| (안 씀) 같은 op | `hvec` | "지금 남은" 응급실 병상 — 음수도 옴, 월 1회 스냅샷에 안 맞음 | — |
| (안 씀) `getEgytBassInfoInqire`(기본정보) | `hperyn`·`hpbdn` | 응급실 병상 전체·총 병상 | 기관당 1콜 = 528콜 → 쿼터 부담이라 제외 |

- ⚠ **`hvs01` 은 응급실 병상 전체가 아니다** — 울산대병원 실측: 기본정보 `hperyn` 31 vs 실시간 `hvs01` 21(+`hvs02` 8). 그래서 화면 라벨은 "응급실 일반병상"(사장님이 바꿀 수 있는 문구).
- **실시간 op 에는 목록 528기관 중 416기관만 있다**(응급실운영신고기관 등은 빠짐) → 그 기관이 최근접이면 병상 None → 화면 "-". 0 은 "0병상"으로 보인다(확정값).
- 병상 op 가 실패해도 잡은 계속된다(병상만 전부 None + 경고 로그) — 목록이 비는 것만 failed.
- 반경 3km 안에 기관이 없으면 병상·등급은 None(옛 코드는 0·빈값).

### 잡 상세 — K-apt 단지 매칭

**주기**: 매월 21일 06:10

국토부 K-apt(AptListService4 getTotalAptList4, 운영계정 일 10만) 전국 목록 ~2.2만 단지 → 우리 APT·JGC 단지와 4중 게이트 매칭(법정동 cortar_no=bjdCode + 이름 유사도 ≥0.6/세대수 대조불가 시 ≥0.85(한쪽이 다른 쪽을 통째로 품는 포함관계면 0.6, 짧은 어간 3글자 미만은 포함 불인정) + basis 수신 후 세대수 ±15% — ⚠ **엄격 규칙(≥0.85·차수 모호 탈락)은 basis 수신 후에만 적용**한다(pass 2). 목록 API 에 kaptdaCnt 가 없어 후보 선별(pass 1)에선 전 단지가 "아직 모름"이라, 거기서 걸면 basis 로 세대수가 일치했을 정답까지 잘린다(2026-08-31 prod 실측 746건 오탈락 → 세션 389 정정) + **차수 모순 탈락**(양쪽 차수 집합 N차·N단지·N블록이 서로 **부분집합이 아니면** 점수·세대수 불문 탈락 — `{1}` vs `{3}`. 부분집합 `{2}` vs `{2,7}`(예: 분성마을2단지부영 ↔ …(북부부영7차) — 단지 차수는 일치하고 7 은 시공 차수라는 별개 축)은 모순이 아니라 **모호**로 보고 세대수 게이트가 결정: 대조 가능·±15% 통과면 채택, 대조 불가면 탈락. 한쪽만 차수인 경우도 같은 모호 경로), 최고점 동률 탈락). 이름 정규화는 분류 꼬리표(주상복합·도시형생활주택·민간임대·주거복합·실버주택)를 **괄호 유무와 무관하게** 제거 — 우리는 "(주상복합)", K-apt 는 무괄호 "주상복합" 이라 한쪽만 지우면 격차가 벌어진다(세션 389 실측). **전량 목록 회차(list_complete=True)는 이번에 재확인 안 된 옛 매칭 + 그 관리비를 삭제**(`purged`), 부분 목록·매칭 0건 회차는 절대 삭제 안 함 → kapt_complex_map upsert + 복도유형·세대수(AptBasisInfoServiceV5). 매칭분마다 basis 1콜(0.3s throttle)이라 1h 초과 상시 → _STALE_HOURS_BY_TYPE 8h 등록(2.2만 basis 콜 × RTT 0.8s ≈ 4.45h 라 옛 4h 는 오탐 sweep 구간 — 관측 최대의 ~2배로 상향). 네이버 0, 토글 KAPT_ENABLED(기본 false — 세션 388 첫 배포는 꺼서, 수동 트리거 라이브 검증 후 ON). 쿼터 버킷은 kapt 전용(전역 9,000 과 격리, 세션 388)

### 잡 상세 — K-apt 관리비 수집 (항목별 금액 = 세부 칸 합, 세션 417)

공용관리비 op 는 op 마다 금액 칸이 1~9개다. 세션 417 전 파서(`kapt_api._extract_amount`)는 **식별 칸을 뺀 첫 숫자 칸 하나**만
저장해, 다칸 op 5종(인건비·제세공과금·차량유지비·그밖의부대비용·사무비)이 과소 집계됐다. 지금은 `_COST_AMOUNT_FIELDS`
(op → 금액 칸 목록) 사전의 칸을 전부 더하고, **사전에 없는 op 는 저장하지 않고 경고**, 사전에 없는 칸이 오면 합계는 내되
경고한다. 개별사용료 5 op 는 전과 같이 공용(C)+전용(P) 두 칸 합(`_extract_paired_amount`).

22 op 전수표 — 공개 단지 A50630215(건영아파트, complex_no 10465)·202606 실측 원문(2026-09-24, 19콜 + D2 3콜). 전 칸이 원 단위
금액이라 **제외 칸은 식별 칸(kaptCode·kaptName)뿐**이다(공식 명세 페이지는 찾지 못해 칸 이름·값으로 판정).

| op | 칸 (값) | 옛 저장값 | 정정 후 |
|---|---|---:|---:|
| 인건비 LaborCost | pay 7,190,420 · sundryCost 1,088,560 · bonus 0 · pension 924,360 · accidentPremium 78,460 · employPremium 94,710 · nationalPension 250,360 · healthPremium 335,140 · welfareBenefit 300,000 | 7,190,420 | **10,262,010** |
| 제세공과금 Taxdue | electCost 0 · telCost 31,180 · postageCost 2,000 · taxrestCost 0 | 0 | **33,180** |
| 차량유지비 VhcleMntnc | fuelCost 0 · refairCost 0 · carInsurance 0 · carEtc 0 | 0 | 0 |
| 그밖의부대비용 Etc | careItemCost 84,900 · accountingCost 0 · hiddenCost 22,900 | 84,900 | **107,800** |
| 사무비 Ofcrk | officeSupply 0 · bookSupply 97,440 · transportCost 15,000 | 0 | **112,440** |
| 피복비 Clothing | clothesCost 0 | 0 | 0 |
| 교육훈련비 EduTraing | eduCost 0 | 0 | 0 |
| 청소비 Cleaning | cleanCost 5,161,430 | 5,161,430 | 5,161,430 |
| 경비비 Guard | guardCost 11,012,010 | 11,012,010 | 11,012,010 |
| 소독비 Disinfection | disinfCost 245,000 | 245,000 | 245,000 |
| 승강기유지비 ElevatorMntnc | elevCost 1,320,000 | 1,320,000 | 1,320,000 |
| 지능형홈네트워크 HomeNetworkMntnc | hnetwCost 0 | 0 | 0 |
| 수선비 Repairs | lrefCost1 3,435,000 | 3,435,000 | 3,435,000 |
| 시설유지비 FacilityMntnc | lrefCost2 665,000 | 665,000 | 665,000 |
| 안전점검비 SafetyCheckUp | lrefCost3 0 | 0 | 0 |
| 재해예방비 DisasterPrevention | lrefCost4 0 | 0 | 0 |
| 위탁관리수수료 ConsignManageFee | manageCost 319,330 | 319,330 | 319,330 |
| 난방비 Heat (개별) | heatC 0 · heatP 0 | 0 | 0 |
| 급탕비 HotWater (개별) | waterHotC 0 · waterHotP 0 | 0 | 0 |
| 가스사용료 GasRentalFee (개별) | gasC 0 · gasP 0 | 0 | 0 |
| 전기료 Electricity (개별) | electC 157,860 · electP 15,989,840 | 16,147,700 | 16,147,700 |
| 수도료 Water (개별) | waterCoolC 267,170 · waterCoolP 6,644,740 | 6,911,910 | 6,911,910 |

이 단지 합계: 공용 29,433,090 → **32,673,200**, 총액 52,492,700 → **55,732,810**, 세대당(348세대) 150,841 → **160,152**(−5.8% 과소였다).
⚠ **기존 저장분은 재계산 불가** — breakdown 이 op 당 정수 1개(첫 칸)만 보관해 나머지 칸이 없다. 바로잡으려면 재수집뿐이다
(2026-09-24 실측: 10,521행 전부 다칸 op 5종 보유, 제세공과금은 10,357행이 0 으로 저장). 새 달이 공개돼 수집되면 그 달 행은 정정된
값으로 쌓이고 화면은 최신월을 보므로, 재수집 없이도 단지마다 다음 공개월부터 바른 값이 보인다.
가드 = `tests/test_kapt.py` 의 원문 22건 표 대조 · 칸 사전 ↔ 원문 칸 일치 · 전 칸 자릿수 합 · `/kapt` 응답 합계.

**09-25 실사고 — 제공기관 부분 장애(오류 봉투 04)에 회차 통째 포기 (세션 417 후속)**
- 06:20 회차가 12초 만에 failed(08:02 수동 재실행도 17초): 첫 op 응답이 정상 구조가 아니라 data.go.kr 오류 봉투
  `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR","returnAuthMsg":"HTTP 에러","returnReasonCode":"04"}}}`
  였다. 같은 시각 다른 (단지, 달)은 정상·미공개 모양을 줬고, 같은 조합도 호출마다 04 와 정상이 오락가락했다(08:05 04 → 08:18 정상, 08:16 포털 회복). 저장 0행 — 오염 0.
- 우리 결함 3: ① 봉투를 `data["response"]` KeyError 로 뭉개 사유 코드(04)를 버림 ② 연속 5단지 실패를 1.2초 만에 판정해 그날 회차 포기 ③ 카나리 표본이 창 안 최신 3건(전부 202606 = 고장난 달)뿐이라 "API 는 살아있는데 한 달만 고장" 을 못 가림.
- 처방: `kapt_api._error_envelope` 로 사유째 `KaptApiError(code=…)` · 일시성 코드(01·02·04·05·99)는 3/10/30초 쉬고 같은 호출 재시도(회차 로그 `일시 오류 재시도 N콜`) · 연속 실패 임계에서 카나리 → 살아있으면 계속, 죽어 있으면 30/60/120초 재확인 뒤에만 `api_down` · 카나리 표본에 **창 안의 더 이전 달 1건** 추가(최대 4콜, 창 밖은 안 씀) · 카나리 덕에 끝까지 갔는데 수집 0 이면 `partial_outage` failed(사유 코드 포함) · 알림은 `plain_words` 번호별 우리말.
- 한계·비용: 회차 시간 예산 150분(단지 사이에서만 검사 — 최악 1단지 17.6분+카나리 15분이 겹치면 3h 를 조금 넘을 수 있음). 카나리 표본 4건은 논리 호출이고 재시도 포함 최대 16콜·표본당 43초(이전 달 표본은 연속 실패 재확인 경로에서만 — 전량 빈 응답 가드는 최신 3건 그대로). `kapt_match` 경로(목록·기본정보)도 같은 재시도를 타서 장애 지속 시간만큼 늘어난다(임계 8h). 수집 ≥1·실패 ≥1 이면 completed 에 "N단지 호출 실패(마지막 사유: …)" 를 남긴다.

### 잡 상세 — data.go.kr API 버전 감시

**주기**: 일요일 06:40

코드가 쓰는 엔드포인트 **13종(apis.data.go.kr 9 + odcloud 4)** — 실거래가·응급의료 2종(목록·실시간 가용병상 — 세션 417 추가)·대기질 2종·K-apt 4종 + **odcloud 4종(청약홈 오피스텔/민간임대·국세청 사업자상태·국세청 진위확인·경찰청 범죄통계)** 을 serviceKey 만 넣고 최소 호출로 찔러 폐기 감지 → dead 있으면 텔레그램 1건으로 묶어 알림. 판정은 **계열별로 다르다**(레지스트리 `flavor`): ① apis.data.go.kr = `NO_OPENAPI_SERVICE_ERROR`/returnReasonCode "12" 만 dead, 코드 11(파라미터 부족)·정상응답은 alive, 코드 30(키 미등록)·05(타임아웃)·네트워크 예외는 **degraded(로그만, 알림 0)**. ② odcloud = `returnReasonCode` 를 안 쓰고 `{"code":-N,"msg":...}` 를 주므로 **`code:-3`("등록되지 않은 서비스", HTTP 404) 만 dead**, `code:-4`(인증키 오류)·411(바디 형식)은 degraded/alive, `currentCount`·`data`·`status_code` 등 양성 증거가 있을 때만 alive (2026-08-29 라이브 실측). ⚠ odcloud 항목에 `flavor` 를 빠뜨리면 판정기가 어긋나 **전부 degraded 로 뭉개져** 그 API 만 감시 사각지대가 된다. ⚠ 국세청 사업자 API 2종(사업자상태 status·진위확인 validate)은 **POST 전용**이라 레지스트리에 `method:"POST"` + 조회 전용 바디를 명시(GET 으로 찌르면 405 라 생사 판별 불가) — 바디 스키마도 서로 다르다(status=`{"b_no":[...]}`, validate=`{"businesses":[{...}]}`). ⚠ **국세청 두 오퍼레이션은 같은 서비스(nts-businessman/v1) 아래여도 각각 등록**한다 — data.go.kr 은 오퍼레이션 단위로도 폐기·개편하므로, 서비스 통째 폐기만 잡으면 되는 청약홈(4 오퍼레이션 → 대표 1개)과 달리 status(휴폐업 차단)·validate(가입 진위확인)는 둘 다 공인중개사 검증의 생명줄이라 개별 감시가 필요하다(세션 394 신설). dead 발견은 잡 실패가 아니라 "완료 + 알림"(CrawlJob completed). 네이버 0, data.go.kr 쿼터 13회라 영향 무시, 토글 API_VERSION_MONITOR_ENABLED(기본 true). ⚠ **새 data.go.kr API 도입 시 `crawler/api_version_monitor.py` PROBE_REGISTRY 에 1줄 추가 의무** — 빠지면 그 API 만 감시 사각지대 (2026-08-19 사고: data.go.kr 이 인증 예외 처리 종료로 구버전 엔드포인트(AptListService3·AptBasisInfoServiceV4 등)를 공지 체감 없이 폐기 → 이 프로젝트·mibunyang 동시 수집기 장애)

### 잡 상세 — 크롤링 모니터

**주기**: 10분 interval

crawl_jobs 정합성 점검 후 텔레그램 알림. ⚠ **알림 문구는 전부 쉬운 우리말이어야 한다**(사장님 지시 2026-09-15, 세션 407 PR #524) — 사전 = `crawler/plain_words.py`(작업이름 `JOB_WORDS` — 개수는 `len(JOB_WORDS)` 로 센다, 세션 410 실측 30 + 에러 번역 `explain_error` + 행동문구 `action_words` + 상태어 `status_words` + 옛 문장 변환 `plainify_detail`). **새 job_type 을 만들면 `JOB_WORDS` 와 FE `crawl-job-labels.ts` 양쪽에 등록**(`tests/test_plain_words.py` 가 양방향 대조로 차단). 알림 문구에 영문 job_type·개발자 에러 원문(psycopg2 등)·`batch`·`running`·`red` 를 다시 넣지 말 것. 저장된 옛 `monitor_alerts.detail` 은 **발송 직전** `plainify_detail()` 로 변환한다(DB 무변경). (운영 토글 MONITOR_ENABLED, 2026-05-25 세션 229 30→10→20 답습 후 현 .env MONITOR_INTERVAL_MIN=10 운영. 기본 _STALE_HOURS=1h — 정상적으로 오래 도는 잡은 _STALE_HOURS_BY_TYPE 예외 의무: public_trade_data 3h(세션 266)·official_price 16h(세션 369 오탐 sweep 실사고 — 새 장시간 잡 추가 시 이 표 동반 등록)·kapt_match 8h·kapt_costs 3h(세션 388 — 배포 전 사전 등록, kapt_match 는 basis 콜 소요 재산정으로 4h→8h). _FAILED_WINDOW_HOURS=24. 전부 monitor.py 상단 상수, 인터벌 격하 무관) **실패 버스트 경보**(세션 396 PR #486): 60분 창 안 같은 job_type failed ≥5 이면 `crawl_failed_burst:<job_type>` 1건 발화 — job_type 단위 "자가복구" 선필터(마지막 failed 뒤 completed 가 있으면 skip)가 배치 부분 실패(9/9 14:45 13/50)를 통째로 은폐하던 사각 보완. 같은 job_type 의 `crawl_failed` 가 활성이면 생략, 쿨다운 6h 공통, 창 이탈 해소 문구는 "추가 실패만 멈춤"(정상 복구 오보 방지), 같은 job_type 의 crawl_failed 로 승계돼 사라진 경우는 "같은 작업의 실패 경보로 이어짐" 문구(세션 397 — 승계를 창 이탈로 오보하던 결함).

## Supabase DB 전면 다운 런북과 재발 이력

> `.claude/rules/infra.md` §DB 커넥션 풀 아래에 있던 두 절(세션 378 런북 · 세션 381 재발+근본원인·처방)을 세션 412 규칙 파일 다이어트로 **원문 그대로** 옮겼다. infra.md 에는 결론 두 줄과 이 절로의 포인터만 남는다.

### Supabase DB 전면 다운 진단 런북 (세션 378 — 2026-08-22 29분 다운 실사고)

`/health/db` 가 `{"status":"degraded","db":"down"}` 이거나 statement timeout 이 연쇄로 터지면,
**층위 순서대로** 어느 층이 죽었는지 국소화한다 (어느 층이냐로 책임 소재·처방이 갈린다):

1. `curl https://api.2u.pe.kr/health` (정적 200) — 백엔드 프로세스·터널 생존 확인 (DB 무관)
2. `curl -m 30 https://api.2u.pe.kr/health/db` — 판정에 ~10초(pooler 2 IP × connect_timeout 5s) 걸리니 `-m 10` 이면 빈 응답으로 오판한다
3. 로컬 → pooler TCP 소켓 연결 (python socket, 5432·6543) — TCP 즉시 OK + pg 연결만 timeout 이면 네트워크 무혐의
4. pg 연결을 connect_timeout 25s 로 재시도해 **에러 문구** 확보 — `FATAL (ECHECKOUTTIMEOUT) unable to check out` = Supavisor(풀러)는 살아있고 뒤의 DB 컴퓨트가 응답불능(또는 풀 고갈)
5. REST(PostgREST) 교차 확인 (`{ref}.supabase.co/rest/v1/...` + anon key) — 이것도 timeout 이면 DB 컴퓨트 다운 확정 (별도 경로라 우리 백엔드 무혐의 입증)
6. `netstat` 으로 이 PC 가 쥔 pooler 연결 수 — 소수면 로컬 연결누수 무혐의
7. status.supabase.com 은 **공지가 늦을 수 있다** (실사고: 다운 중에도 서울 리전 "Operational")
8. **Database Logs 탭에서 OOM/PANIC/FATAL 원문 확인** — 대시보드 그래프(메모리·스왑 등)
   판독만으로 "OOM 이었다"고 단정하지 말 것(세션 381 사후검증에서 "유력 가설"로 격하된 전례,
   §DB 크래시 재발 항목 참조). 경로 = **대시보드 → Observability → Logs → Postgres Logs**.
   서버 로그 원문(`out of memory`/`terminated by signal`/`PANIC`/`FATAL`)을 직접 봐야 가설이
   확정으로 승격된다 — 급할 때 건너뛰기 쉬우니 진단 순서에서 스킵하지 말 것.

**처방**: 자가회복 대기 우선 (실사고 29분 자가회복). ⛔ 성급한 backend 재시작 금지 — 재시작은
DB 를 못 살리고, 부팅 스윕(main.py, **시작 5분 경과한 running 잡** 대상)이 외부 프로세스의 잡
(수동 재수집 등 — 수 시간 돌므로 항상 해당)까지 cancelled 로 오염시킨다. 근본원인(DB 컴퓨트
CPU/RAM/IO)은 Supabase 대시보드 그래프로만 확인 가능(사장님 로그인), 단 위 8번(서버 로그
원문)까지 함께 봐야 가설이 아니라 확정 진단이 된다.

**연쇄 함정 2건** (실사고에서 실증, #411 로 폴백 견고화):
- 잡 실패 마킹 중 DB 가 죽으면 `_fail_job` 폴백까지 동반 사망해 CrawlJob 이 'running' 유령으로
  잔존할 수 있다 → official_price **체크포인트 재개는 status IN ('failed','cancelled') 만 훑으므로
  재개가 차단**된다. 프로세스 사망을 실측 확인한 뒤 그 잡을 수동 UPDATE(`AND status='running'` 가드)로
  failed 정정해야 재기동이 이어받는다 (또는 backend 재시작 시 부팅 스윕의 cancelled 로도 해소).

### 재발 (세션 381 — 2026-08-24 03:22~03:56 34분 다운, 2회째) + 근본원인·처방

같은 런북으로 34분 만에 자가회복. 사장님이 대시보드 Database Health 그래프(스크린샷)를 제공해
원인을 추적: **Micro(RAM 1GB) 인스턴스가 스왑 1GB 상시 포화·메모리 커밋이 한도의 약 2배로 만성
압박 상태**였고, 거기에 PostgREST 경유 대량 요청(연결 급증, Logs Explorer 로 재구성 —
`/rest/v1/apartments` 03:03=1,901건)이 시간상 겹쳤다. 디스크 IOPS 는 거의 0 이라 "IO 예산 소진"
단독 가설은 기각(단 주간 누적 통계는 82%로 근접 — 10분 풀스캔이 누적 원인, 아래 처방 (b)로 제거).

⚠ **사후 적대검증(세션 381) 결과 — "OOM 크래시"는 확정이 아니라 유력한 가설로 격하한다.**
Postgres 서버 로그(Database Logs 탭)의 `out of memory`/`terminated by signal`/`PANIC`/`FATAL` 원문은
한 번도 직접 확인하지 못한 채, 대시보드 그래프(스크린샷) 판독만으로 "OOM"이라 단정했었다.
Linux 메모리 오버커밋 모델상 "커밋이 물리 한도의 2배"라는 관찰 자체가 자동으로 OOM 을 뜻하지는
않는다(실제 그 커밋을 프로세스가 소비했는지가 중요 — WebSearch 로 확인). 마찬가지로 "PostgREST
버스트가 크래시의 마지막 지푸라기였다"는 인과관계도, 버스트(03:03)와 크래시(03:21~03:22) 사이
19분 공백을 검증 없이 은유로 얼버무린 것으로 확인 — 시간상 근접(상관관계)만 확인됐을 뿐 인과관계는
미확정. **다음 재발 시 최우선으로 Database Logs 탭에서 OOM/PANIC/FATAL 원문을 확인해 가설을
확정으로 승격할 것.**

**처방(세션 381 실행 완료)**:
- 컴퓨트 **Micro → Small** 업그레이드(대시보드 Project Settings → Infrastructure, 다운타임 <2분,
  자동 재시작 동반, +$5.15/월). RAM 1→2GB·연결한도 60→90·shared_buffers 256MB→512MB(SQL SHOW 로
  prod 실측 확인).
- `V048__freshness_max_indexes.sql` — monitor(10분 interval) 의 `compute_freshness` 가 캐시를
  우회해 매번 스캔하던 trades(347MB)·complex_price_history(72MB)·complexes(44MB) 의 max() 컬럼에
  인덱스 3개 추가. CIC 로 prod 적용, `pg_index.indisvalid` 3개 전부 True 재확인, `EXPLAIN (ANALYZE,
  BUFFERS)` 이 Index Only Scan **0.05~0.06ms**로 전환됨을 실측(기존 2~4.6초 Seq Scan). freshness
  최적화는 과거 `project_freshness_do_not_optimize.md`(세션 262)가 "실익 없음"으로 막았던 항목인데,
  그 결론의 전제(max+count 미분리)가 세션 342·381 에서 깨져 무효화됨 — 상세는 그 메모리 파일의
  2026-08-24 갱신분 참조. ⚠ 이 PR(#416)의 신규 테스트는 BE 테스트 환경이 SQLite 고정이라 V048
  인덱스 사용 경로 자체는 검증하지 못한다(리팩터링 안전성만 검증) — 인덱스 효과는 위처럼 prod
  EXPLAIN 으로만 확인 가능하다는 걸 유사 PR 작성 시 유념할 것.
- 외부 uptime 감시(UptimeRobot, 무료, `api.2u.pe.kr/health/db` 5분 간격 + 이메일 알림) 신설 —
  기존 GitHub Actions 일일 1회 healthcheck 를 보완, 장애 통지까지 5분 내로 단축.

## 스케줄러 운영 배경 3절

> `.claude/rules/infra.md` §스케줄러 표 아래에 있던 세 절(짧은 주기 크론과 재시작 겹침 · 스케줄러 잡 에러 최후 안전망 · monitor freshness 풀스캔 timeout 방지)을 세션 412 에 **원문 그대로** 옮겼다. infra.md 에는 규칙 세 줄과 포인터만 남는다.

### 짧은 주기 크론과 재시작 겹침 — 반복 재시작은 몰아서 하지 말 것 (세션 372 실측)

`official_price`(매월 15일, 몇 시간짜리)처럼 **긴** 잡은 release.md §3-0 ⏰ 시각표(재시작 절대
금지 구간)와 `backend/.claude/details.md` §잡 상세 — 공동주택 공시가격 수집 에 "실행 중 재시작 회피"로
이미 박혀 있다(세션 411 에 그 원문이 이 파일 하단에서 details.md 로 옮겨졌다 — "위 표" 가 아니다). 이 절은 그 반대 — **짧은 주기(10분·30분 interval) 크론이라도, 재시작이 짧은
시간에 몰리면 도중 작업이 끊기거나 그 순간 DB 부하가 겹쳐 흔들릴 수 있다**는 일반 원칙.

- 서버 재시작 시 `main.py`의 부팅 스윕(SQL, `tests/test_stale_running_sweep.py` 회귀 가드)이
  재시작 직전에 실행 중이던 잡을 `cancelled` 로 정리한다 — error_message 에는
  `stale running — swept on startup` 마커를 **append** 한다(기존 문구가 있으면
  `원문 | 마커` 형태 — 세션 391 PR #443 부터. 조회는 정확 일치 대신 `LIKE '%swept%'` 권장).
  이건 의도된 안전장치라 그 자체는 정상이다. 문제는 **재시작이
  짧은 간격으로 여러 번 몰리면** 이 정리가 반복되고, 마침 재시작 순간이 크론 실행 시각과
  겹치면 그 주기의 작업이 스킵되거나 중간에 끊긴 것처럼 보인다.
- 재시작 순간 DB 커넥션이 새로 맺어지는 타이밍에 다른 크론(예: `complex_articles`)이 마침
  대량 upsert 중이면 `statement_timeout`(8초, infra.md §DB 커넥션 풀)에 걸려 실패할 수도 있다 —
  DB 자체 장애가 아니라 재시작 타이밍이 만드는 일시적 혼잡.
- **처방**: 여러 PR을 연속 배포할 때 매 PR마다 재시작하지 말고, 가능하면 **묶어서 한 번에
  재시작**한다(release.md §2 cross-check 는 PR 단위가 아니라 "이번에 반영할 변경 묶음"
  단위로 해도 된다). 부득이 짧은 간격으로 여러 번 재시작해야 하면, 크롤링 모니터 텔레그램에
  "마비→복구" 알림이 여러 건 몰려도 **재시작 시각과 겹치는지부터 대조** — 진짜 장애인지
  재시작 부작용인지 구분한다(구분법: 아래 사건의 `backend_<mtime>.log` 회전 로그 대조 실측
  참조).

> **사건**: 2026-08-14 — 세션 369가 PR #381~#385를 순차 배포하며 하루 8회 재시작
> (00:11·00:19·01:59·03:22·05:57·07:53·11:32·14:56). 01:59:48 재시작이 02:00:00 대기질
> 크론을 정확히 덮침 + 05:52 무렵 재시작 스윕이 `article_detail`을 cancelled 처리하고
> 직후 `complex_articles`가 statement_timeout으로 failed → 텔레그램에 "article_detail
> 마비→복구"·"매물 상세 보강 실패(DB connection timeout)" 알림 4건 발생. 세션 372에서
> 회전 로그(`backend_2026081*.log`)·`crawl_jobs`·`monitor_alerts`(전부 `status=resolved`)
> 3중 대조로 "진짜 장애가 아니라 재시작 몰림의 부작용이었고 이후 재발 없음"을 확정.
> `official_price` 16h 예외(세션 369, #382)가 "긴 잡" 케이스를 이미 막았듯, 이 사건은
> "짧은 잡 다건"이 재시작과 겹치는 반대 케이스라 본 절로 별도 문서화.

### 스케줄러 잡 에러 최후 안전망 (세션 340, PR #273)

`crawler/job_error_listener.py` = `scheduler.add_listener(job_event_listener, EVENT_JOB_ERROR | EVENT_JOB_MISSED)` (main.py lifespan `register_job_listener` 배선). monitor.py 는 **CrawlJob row 가 이미 기록된** 실패만 감지 → 잡이 CrawlJob 기록 **전에** 예외로 죽거나 misfire(누락) 스킵되면 사각지대였음. 리스너가 스케줄러 이벤트 레벨에서 그 두 경우를 포착해 `logger.error/warning` + 텔레그램(`(kind, job_id)` 별 600초 쿨다운). event.code 로 ERROR/MISSED 분기(misfire 는 `.exception` 미접근 — AttributeError 회피). 텔레그램 실패는 best-effort 흡수(리스너 안 죽음). TELEGRAM_ENABLED 공유.

### monitor freshness 풀스캔 timeout 방지 (세션 342, PR #279·#281)

크롤링 monitor(10분 interval)가 `compute_freshness`(routers/admin/freshness.py)로 8종목
풀 테이블 집계를 하는데, **대형 테이블 풀스캔이 부하 시 8초 statement_timeout 을 넘겨
트랜잭션 aborted → 같은 세션의 monitor_alerts 쿼리가 InFailedSqlTransaction 으로 연쇄
실패**하며 매 10분 크래시했다(세션 342 실측, 텔레그램 진단 중 발견). 3겹 처방:

1. **트랜잭션 격리** (monitor.py, 축 A) — `compute_freshness` 를 **별도 `SessionLocal()`
   세션**으로 실행. timeout 나도 monitor 메인 트랜잭션 무손상(크래시 즉시 차단). 라이브
   실증: timeout 나도 InFailedSqlTransaction 0.
2. **max/count 분리 + 인덱스** — max+count 묶으면 count 풀스캔이 max 인덱스를 무효화
   (`[[feedback-combined-aggregate-index-void]]`). 물리 2쿼리로 분리 + **V038
   `ix_articles_updated_at`**(max 0.07초). 대형 count 는 **reltuples 근사**(`_approx_count`,
   articles·trades·complex_price_history 3종, 화면 표시용이라 근사 허용·오차 0%, SQLite
   폴백). new_rows(헛바퀴 감지 `created_at≥job_start` count)는 **V039 `ix_articles_created_at`**.
3. **결과**: compute_freshness **9.2초 → 0.6초**(부하 8배도 8초 여유). V038·V039 둘 다
   CONCURRENTLY prod 적용완료(락0). ⚠ freshness count 는 **순수 표시용**(status=시각 기반,
   spinning=crawl_jobs 기반) — 근사 오차가 알림 오판 유발 0.

> 교훈: 이 monitor 크래시는 **statement_timeout(8초 안전망)이 오히려 방아쇠**였다 — 폭주
> 쿼리를 죽이는 게 목적이나, 정상 집계 쿼리가 대형 테이블 성장으로 8초를 넘기면 monitor
> 자신을 죽인다. 신선도·집계 쿼리는 테이블 성장 대비 **인덱스 or 근사**로 상시 <1초 유지 의무.

## release 레거시 재기동 절차

> `.claude/rules/release.md` §3 의 레거시 블록(nssm 서비스 제거·수동 운용 폴백 시에만 유효 — 옛 Startup BAT 시절 kill+schtasks 절차)을 세션 412 에 **원문 그대로** 옮겼다(§4 참조 2곳만 이 파일의 절 이름으로 고침). 현행 절차 = release.md §3-1 `Restart-Service naver-orchestrator`.

**레거시 (nssm 서비스 제거·수동 운용 폴백 시에만 유효 — 옛 Startup BAT 시절 절차):**

```powershell
# Step 1: orchestrator 종료 — python.exe·pythonw.exe 둘 다 잡는다
#   재부팅 경로(Startup BAT)·§3 schtasks 명령은 pythonw 로, 수동·세션 셸 재기동은 python 으로 뜰 수 있어
#   이름 하나만 필터하면 놓친다. ⚠ Get-Process 는 Windows PowerShell 5.1 에 CommandLine
#   속성이 없어 필터가 조용히 0건 — Get-CimInstance 필수 (세션 353 발견: 옛 명령은 무동작).
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Step 1-b: 사멸 확인 — 0건이어야 다음 단계 진행 (예외 0)
#   옛 orchestrator 가 살아 있으면 새 인스턴스가 _check_already_running() 에서 조용히
#   sys.exit(0) → "재시작했다고 믿었는데 안 된" 사고. 세션 352 의 성공은 옛 PID 가
#   이미 죽어 있던 우연이었다 (§release 사건 박제 표 세션 352~353 행).
(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } | Measure-Object).Count  # 기대: 0

# Step 2: uvicorn 자식 좀비 정리 (port 8002 점유 프로세스 명시 종료)
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess
if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }

# Step 3: 3초 대기 (포트 해제 + 프로세스 graceful exit)
Start-Sleep -Seconds 3

# Step 4: 재시작 — 반드시 "세션 수명과 분리된" 방식으로
#   옵션 A (가장 안전): PC 재부팅 → Windows Startup BAT 가 orchestrator 자동 기동
#   옵션 B (재부팅 없이): schtasks 일회성 작업 경유 — 부모가 작업 스케줄러 서비스라
#     Claude 세션·터미널이 닫혀도 살아남는다 (세션 353 라이브 검증 완료)
schtasks /Create /TN naver-orch-restart /SC ONCE /ST 23:59 /F /TR "C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe D:\naver-estate-web\scripts\startup_orchestrator.py"
schtasks /Run /TN naver-orch-restart
schtasks /Delete /TN naver-orch-restart /F   # 정의만 삭제 — 실행 중 프로세스는 안 죽는다
#   ⛔ 금지: Claude 세션·터미널 셸에서 python 으로 직접 기동 — 그 창이 닫히는 순간
#     Windows 가 orchestrator+uvicorn 트리를 통째로 죽인다(무로그·무알림 급사,
#     watchdog 도 같이 죽어 자동복구 0 — §release 사건 박제 표 세션 352~353 실사고)
#   ⚠ 실행 방식: 위 PowerShell 명령들을 bash(Claude 셸)에서 -Command 인라인으로 돌리면
#     인용부호가 깨져 Get-CimInstance 쿼리가 실패하는데 카운트만 0 으로 찍힌다(가짜 0 —
#     종료가 실행된 적 없는데 성공처럼 보임, 세션 354 재현). 반드시 .ps1 파일로 저장 후
#     `powershell -NoProfile -File <경로>` 로 실행할 것. 패턴 필터가 헛돌면 전체 python
#     프로세스 나열 진단으로 정확한 PID 를 확인해 PID 지정 종료가 최선 — 같은 PC 에
#     타 프로젝트 python 프로세스가 다수 상주한다(오살 방지).

# Step 5: 부팅 검증 (셋 다 확인)
Start-Sleep -Seconds 45   # INITIAL_DELAY 10초 + 백엔드 기동 + health check 여유
Get-Content scripts\startup.log -Tail 8   # 기대: 새 "서버 자동 시작" 헤더 + "백엔드 정상 시작 완료"
Get-Content scripts\orchestrator.pid      # 기대: 새 PID (tasklist /FI "PID eq <값>" 생존 확인)
curl.exe -s https://api.2u.pe.kr/health/db   # 기대: {"status":"ok","db":"ok"} (외부 경로 ground truth)
```

## release 사건 박제 표

> `.claude/rules/release.md` §4 의 사건 표(세션 229~411, 12행)를 세션 412 에 **원문 그대로** 옮겼다. 새 사건은 여기 행을 추가한다(release.md §4 에는 요약 한 단락만 남는다).

| 세션 | 사고 | 영향 |
|---|---|---|
| 229 (2026-05-24) | PR #61 (가치지표 배치 200→1000, 25일 완주) 머지 후 backend 재시작 안 됨 | 가속 효과 검증 시각 미도래로 다음 세션 이월 |
| 230 (2026-05-25) | 5/25 08:30 KST cron 도래했으나 total=200 옛 코드 가동 발견 | 사용자 watchdog 수동 재시작 + 5/26 cron 검증 이월 |
| 231 (2026-05-25) | backend 5/24 15:26 부팅 = PR #61 머지 (5/25 06:09) 보다 15시간 전. zombie 동일 패턴 지속 | 사용자 옵션 3 (재시작 보류) 선택. 본 세션 232 룰 git 박제로 재발방지 |
| 257 (2026-06-01) | PR #102 후 "재시작 불필요" 정적 결론 3회 → 라이브 GET 으로 화면 표시 옛값(08:30/20분/6시간) 확인 = 재시작 필요로 정정. trigger 동작은 새값이나 표시 모듈 본문이 옛 코드 | release.md §2 에 라이브 표시값 4번째 지표 + §5-1 정적분석 함정 추가. 사용자 PC 재부팅 선택 |
| 301 (2026-06-13) | PR #167 (mb 정렬 nullif) 머지 후 라이브 backend PID 20368 이 머지 19h 전 부팅 = zombie. 라이브 pp_asc 가 0 맨앞(옛 동작). 6렌즈 적대검증 + prod PG 직접 실측(OLD `[0,0,0,0,0]` vs NEW `[1122,...]`)으로 "디스크 정상·라이브만 옛코드" 확정 | §2 에 "4중→PR성격별 3중" + prod DB 직접실측 거짓양성 차단 노하우 추가. 사용자 PC 재부팅 선택 |
| 352~353 (2026-08-09) | 세션 352 가 zombie 해소를 위해 orchestrator 를 **자기 세션 셸에서 python 으로 직접 재기동**(02:55) → 그 세션 창이 닫히자 05:42 orchestrator+uvicorn 트리 동반 급사(무로그·무알림). watchdog 도 같이 죽어 자동복구 0, 다음 세션(353)이 발견할 때까지 backend 다운 방치. 부수 발견 2건 = ① 옛 §3 `Get-Process pythonw` 는 PS 5.1 CommandLine 속성 부재로 애초에 무동작 ② 수동 재기동 시 프로세스명이 python 이라 pythonw 단일 필터도 미스매치 | §3 전면 보강: Get-CimInstance 양이름 필터 + Step 1-b 사멸확인 + schtasks 세션독립 재기동(세션 353 라이브 검증) + 세션 셸 직접 기동 금지 명문화 |

| 363 (2026-08-14) | (사고 규명+구조 전환) Windows Update(KB5120249) 야간 계획 재부팅 → Startup BAT 가 로그인 의존이라 로그인 화면에서 **13시간 backend 다운**(watchdog·스케줄 전체 미기동, 상세 = infra.md §자동 시작 사건). orchestrator 를 nssm 서비스로 전환. 라이브 훈련 1차에서 비관리자 Stop-Process 액세스 거부 실측 → 서비스 DACL 시작/중지 권한 등록 후 훈련 2차 Restart-Service 15초 복구 검증 | §3 현행 절차를 Restart-Service 1줄로 교체, 옛 schtasks 절차는 레거시 폴백 격하. 부팅 자동 기동(로그인 불필요) + orchestrator 급사 60초 자동복구 확보 |
| 386 (2026-08-26) | (무피해, 절차 결함) PR #425(`crawler/service_applyhome_officetel.py`·`routers/mb_serializers.py` 주석 정정)를 "diff가 주석뿐이라 재시작 불필요"로 그 자리에서 판단 → §5 기존 3가지 면제 사유(FE전용/문서전용/테스트전용) 어디에도 안 맞는데도 재시작 생략. 사후검증에서 AST 비교로 실행 코드 무변경을 사후 확인해 결과는 안전했으나, 판단 당시엔 §5-1이 금지한 "정적분석만으로 단정"과 동일 패턴이었음 | §5 에 4번째 면제 조건(AST 비교로 실행 코드 구조 동일 확인된 텍스트 정정) 명문화 — 눈대중 판단과 기계적 확인을 구분 |
| 396 (2026-09-10) | (무피해, 절차 결함 2건) ① PR #486·#487 머지 후 `Restart-Service naver-orchestrator` 첫 시도가 **조용히 실패** — 45초 대기 후에도 8002 포트 소유 PID·startup.log 시각이 그대로였고, bash 파이프에서 PowerShell 출력이 "Binary file matches" 로 가려져 실패가 안 보였다. try/catch + 전후 상태 출력으로 재실행하니 정상 (orchestrator 6080→61116, backend 7500→62280, 07:56:40). ② 같은 세션의 레포 삭제 사고로 `orchestrator.pid` 가 사라져 4중 cross-check 의 한 축이 무력화된 채였다(재시작 후 자동 복구됨) | §3 에 "포트 소유 PID 변화로 판정"·"pid 파일 부재 시 3축 판정" 2줄 추가. 라이브 검증은 캐시 헤더 4종 HTTP 실측으로 대체 확인 |
| 397 (2026-09-11) | (무피해, 절차 결함 2건) ① 재시작 직전 "5분 내 도래 크론·running 잡" 확인을 생략 — 다행히 겹친 잡이 없었으나, official_price(3~7h) 같은 장시간 잡과 겹쳤으면 부팅 스윕이 cancelled 처리했을 것. ② `Restart-Service` 후 45초에 포트 소유 PID 가 빈값이라 "실패"로 오판할 뻔함 — 실측하니 서비스 "중지 대기"에만 약 1분, 기동까지 약 65초라 **45초는 판정 시점 자체가 이름**. | §3 을 3-0(사전 확인)·3-1(실행)으로 분리, 대기를 고정 40초 → 포트 폴링(최대 120초)으로 교체 |
| 409 (2026-09-17) | (무피해, 절차 결함) §3-0 (1) 을 재시작 **4분 전**에 확인하고 그대로 믿은 채 02:24 재시작 → 그 사이 02:21:49 에 시작한 `article_detail`(#53918) 이 끊김. 부팅 스윕은 시작 5분 넘은 잡만 정리해 그 잡은 `running` 으로 남았고 02:30 수동 cancelled 처리(경보 미발화). 5분 임계 자체는 세션 208 근거로 유지. ⚠ 세션 410 정정: 손대지 않았어도 monitor 10분 스윕이 1h 뒤 자동 정리했을 것(영구 고착 아님) | §3-0 에 "직전 재조회(1분 룰)" + monitor 이중 스윕 명시 + 긴 임계 잡만 수동 정리 SQL |
| 411 (2026-09-17) | (무피해, 절차 결함) §3-0 을 한 호출로 묶은 판정 스크립트가 **WAIT(exit 1)** — crawl_details 4.3분·monitor 4.1분 내 도래 — 를 냈는데, 뒤에 붙인 `\| grep -v "slow query"` 가 파이프 종료코드를 grep 의 0 으로 바꿔 `&&` 게이트가 통과 → 08:04:07 재시작 실행(44056→27348). 실측: running 0, 그 창(08:03~08:10)에 시작·swept 잡 0, 08:08 예정분은 새 프로세스의 interval start_date 로 08:43 으로 이동. 부수 확인: `next_run_at` 은 jitter 가 **이미 반영된 확정값**이라 5분 판정에 그대로 써도 된다(검사관 C 실측, ±15분 오차 없음) | §3-0 명령 블록에 "판정 명령 파이프 금지" 1줄 + 글로벌 메모리 `feedback_pipe_hides_gate_exit_code` |
