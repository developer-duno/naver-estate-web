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

V-WORLD getApartHousingPriceAttr 법정동 전량 수집 → 단지(APT·JGC) 세대수 게이트 매칭 → 평형별 중위 공시가격 저장 (네이버 0, VWORLD_API_KEY 공유, 토글 OFFICIAL_PRICE_ENABLED — PR-A3). ⚠ 정상 소요 3.6~7h — 실행 중(15일 06:30~오후) 재시작 회피(잡이 프로세스 내 상주라 재시작=중단). 체크포인트 재개는 중단 후 **72h 이내 재실행(수동 재트리거)만** 유효(#387 신선도 바운드, 3개 수집기 공통) — 놓치면 익월 정기 실행이 처음부터 전량 재수집(데이터 무손실, 시간 낭비만) (세션 369·370). V-WORLD 페이지네이션 드리프트(총행수 일치·행 구성 상이)로 대형 단지가 세대수 게이트에서 비결정 탈락 → 본 루프 종료 후 **매칭 소실 재수집 패스**가 새 표본으로 구제, 잔여는 completed 잡의 error_message 에 기록 + **잔여·붕괴(소실 200단지 초과)는 텔레그램 알림**(세션 370). 재수집 패스는 벽시계 1h 캡(`_REPASS_MAX_SECONDS`, 초과분은 잔여 보고 합류) — 재수집 구간에서 강제종료되면 체크포인트가 이미 지워진 뒤라 재실행이 전량 재수집이 되나 데이터 무손실이라 수용(세션 371). **읍/면 리(里) 확장 패스**(재수집 패스 뒤, PR-E2 세션 373) — 읍/면 코드는 공시가격이 전국 공통으로 리 단위 코드에 붙어 있어 애초에 0건인 561개 읍/면(5,808단지)을, `cortar_ri_map.py`(정적 dict, 수동 재생성)로 얻은 리 코드 6,627개로 개별 조회해 회수. 리 하나하나가 독립 단위라 부분 실패가 서로 영향 없음, best-effort. **이름 2차 매칭 패스**(각 fetch 단위 안에서 1차 전량 후, PR-E3 세션 374) — 1차 완전일치가 표기 차이(괄호 차수 `성서주공(2단지)`↔`성서주공2차`·상가 접미사·동명 프리픽스)로 놓친 ~413단지+α 를 회수. 세대수 ±5% 게이트 + 후보 유일성 + claimed(선점 그룹 재사용 금지) 3중 안전장치 + 형제 단지 신호(잉여 숫자) 배제로 보수 원칙 유지, 완료 로그 `이름 2차 매칭 N개` 로 관찰. **표준코드 이관 heartbeat**(수집 시작 시 보초 **6곳** — 2026 개편맵 4곳(옛 중구·동구·서구·화성 데이터셋 대표 1곳씩) + **12-프리픽스맵 2곳**(광주 서구 화정동 1224011900·전남 순천 조례동 1215013300, 세션 391 확장) — 각 코드 1페이지 프로브, 행>0 시 텔레그램 경보 1회로 묶음. 이관되면 cortar_legacy 코드 번역이 역효과라 사람 판단으로 전환. 감지 후 맵 변경 전까진 매 실행 재경보(월 1회라 수용). **감시 범위 = 두 번역맵 전부**(VWORLD_REFORM_CORTAR_MAP·LEGACY_CORTAR_MAP) — 옛 "12-프리픽스 미감시" 백로그 해소. 보초는 반드시 **맵의 키** 쪽이어야 한다(값=표준측을 넣으면 지금도 수만 행이라 상시 오탐 — tests/test_official_price_migration_probe.py 방향 가드가 차단). 세션 375·391). **ho_count 는 유니크 호(dongNm,hoNm) 기준**(세션 376) — V-WORLD 가 호마다 완전 동일 행을 2회 반환(2026-08-22 실측: 2826011800 2,622행=1,311호×2, API totalCount 도 2배, 페이지 안에 섞여 등장, 드리프트로 1·3회도 섞임)해 원본 행 수로 세면 세대수의 2배가 저장됐었다(은마 8,848). fetch 의 `len(rows)==totalCount` 가드는 raw 기준이라 그대로 두고 집계(`aggregate_area_medians`)에서만 dedupe. 게이트와 같은 키라 `SUM(ho_count)≈세대수` 가 정상 지표(9/15 재수집 후 확인). **재수집 패스 소실 판정 2건 보강**(세션 380) — ① 리 확장 대상 읍/면 소속 단지는 소실 판정 **제외**(본루프 읍/면 조회=0건이 정상, 리 확장 패스 관할. 안 빼면 8/22 리 확장으로 올해 행을 받은 3,930단지가 9/15 에 통째로 소실 판정 → 임계 200 초과 "시스템 이상" 오탐 + 진짜 드리프트 구제 전면 생략) ② **재개(resume) 실행은 이어받은 동도 구제** — 이어받은 동(체크포인트 done) 소속 단지 중 "올해 행 보유 AND 마지막 저장 시각 < **그 동을 처음 완료한 사슬 잡의 started_at**(동별 컷오프 — 72h 내 체크포인트 보유 실패잡을 started_at 오름차순으로 훑어 체크포인트 누적 차집합으로 소유 잡 결정, 형식 변경 0)" 인 것을 소실로 합류, 사슬이 그 동에 이미 배정한 aphusCode 는 DB 에서 복원해 이중 배정 차단. 단일 "사슬 시작 min" 컷오프는 "실패 O → 완료 C 가 저장 → 실패 R 이 옛 체크포인트 상속 후 그 동을 새로 처리하다 소실 → 재개" 조합에서 C 의 저장을 "사슬이 매칭함"으로 오판해 못 줍는다(적대검증 MEDIUM 재반박 결과 동별로 정밀화). 8/22 "1차 사망 × 2차 재개" 조합에서 은마가 아무 관할에도 안 들어가 미갱신된 사각(세션 379) 해소. 리 확장 패스 자체의 드리프트 구제는 없음(리=1페이지 소규모, 완료 로그 "읍/면 리 확장 완료 N개" 월별 비교로 관찰)

### 잡 상세 — 응급의료 수집

**주기**: 매월 첫째 월 3시

NEMC 응급의료기관 API. **배치 = 전량**(`EMERGENCY_BATCH_SIZE=0`, 세션 394): 위경도 보유 2,938단지를 매월 전부 갱신한다. 전량이 가능한 근거 = 이 수집기는 **전국 기관목록을 1회만** 받고(`EmergencyAPI.get_emergency_list`) 단지별 처리는 `find_nearest`(순수 로컬 거리계산)뿐이라, **배치 크기가 외부 API 호출 수와 아무 상관이 없다** — 전량이어도 NEMC 호출은 여전히 1회라 비용 증가 0(어린이집이 "시군구당 1콜이라 쿼터 안에서 여유"였던 것보다 더 강한 조건). 옛 배치 100 은 아무 이득 없이 커버리지만 깎았다: **prod 실측 2026-09-05 — 2,938단지 중 496개(16.9%)만 emergency_hospital 이 채워지고 2,442개(83.1%)가 영구 방치**(ORDER BY 없는 `.limit(100)` 이라 DB 임의·사실상 고정 순서의 앞쪽 100개만 매월 재갱신). `infra.emergency_updated_at` 오래된 순(NULL 최우선) 순환 키(V054·세션 394)는 **안전망으로 유지** — 부분 배치로 되돌릴 때의 폴백 + 전량 실행이 도중에 끊겨도 다음 회차가 미수집분부터 이어받게 한다(500단지마다 중간 저장). Infra 행이 없는 단지(mibunyang 미수집분)는 **자동 생성**으로 전환 — 옛 skip 동작은 그 단지들을 영영 못 채워 전량 순환의 취지를 깎았다(childcare 검증 패턴 답습). **첫 실전 = 2026-09-07(월) 이미 완주·합격** — 2,938/2,938 completed(직전 8/3·7/6 은 100/100), prod `emergency_hospital` 채움 2,938 실측(세션 398). 옛 "첫 실전 = 2026-10-05" 표기는 9월 첫째 월요일을 9/1(화)로 오인한 것 — 실제로는 PR #458 머지(9/5) 직후 9/7 에 도래해 관찰 없이 지나갔다. 다음 회차 = 2026-10-05(월)

### 잡 상세 — K-apt 단지 매칭

**주기**: 매월 21일 06:10

국토부 K-apt(AptListService4 getTotalAptList4, 운영계정 일 10만) 전국 목록 ~2.2만 단지 → 우리 APT·JGC 단지와 4중 게이트 매칭(법정동 cortar_no=bjdCode + 이름 유사도 ≥0.6/세대수 대조불가 시 ≥0.85(한쪽이 다른 쪽을 통째로 품는 포함관계면 0.6, 짧은 어간 3글자 미만은 포함 불인정) + basis 수신 후 세대수 ±15% — ⚠ **엄격 규칙(≥0.85·차수 모호 탈락)은 basis 수신 후에만 적용**한다(pass 2). 목록 API 에 kaptdaCnt 가 없어 후보 선별(pass 1)에선 전 단지가 "아직 모름"이라, 거기서 걸면 basis 로 세대수가 일치했을 정답까지 잘린다(2026-08-31 prod 실측 746건 오탈락 → 세션 389 정정) + **차수 모순 탈락**(양쪽 차수 집합 N차·N단지·N블록이 서로 **부분집합이 아니면** 점수·세대수 불문 탈락 — `{1}` vs `{3}`. 부분집합 `{2}` vs `{2,7}`(예: 분성마을2단지부영 ↔ …(북부부영7차) — 단지 차수는 일치하고 7 은 시공 차수라는 별개 축)은 모순이 아니라 **모호**로 보고 세대수 게이트가 결정: 대조 가능·±15% 통과면 채택, 대조 불가면 탈락. 한쪽만 차수인 경우도 같은 모호 경로), 최고점 동률 탈락). 이름 정규화는 분류 꼬리표(주상복합·도시형생활주택·민간임대·주거복합·실버주택)를 **괄호 유무와 무관하게** 제거 — 우리는 "(주상복합)", K-apt 는 무괄호 "주상복합" 이라 한쪽만 지우면 격차가 벌어진다(세션 389 실측). **전량 목록 회차(list_complete=True)는 이번에 재확인 안 된 옛 매칭 + 그 관리비를 삭제**(`purged`), 부분 목록·매칭 0건 회차는 절대 삭제 안 함 → kapt_complex_map upsert + 복도유형·세대수(AptBasisInfoServiceV5). 매칭분마다 basis 1콜(0.3s throttle)이라 1h 초과 상시 → _STALE_HOURS_BY_TYPE 8h 등록(2.2만 basis 콜 × RTT 0.8s ≈ 4.45h 라 옛 4h 는 오탐 sweep 구간 — 관측 최대의 ~2배로 상향). 네이버 0, 토글 KAPT_ENABLED(기본 false — 세션 388 첫 배포는 꺼서, 수동 트리거 라이브 검증 후 ON). 쿼터 버킷은 kapt 전용(전역 9,000 과 격리, 세션 388)

### 잡 상세 — data.go.kr API 버전 감시

**주기**: 일요일 06:40

코드가 쓰는 엔드포인트 **12종(apis.data.go.kr 8 + odcloud 4)** — 실거래가·응급의료·대기질 2종·K-apt 4종 + **odcloud 4종(청약홈 오피스텔/민간임대·국세청 사업자상태·국세청 진위확인·경찰청 범죄통계)** 을 serviceKey 만 넣고 최소 호출로 찔러 폐기 감지 → dead 있으면 텔레그램 1건으로 묶어 알림. 판정은 **계열별로 다르다**(레지스트리 `flavor`): ① apis.data.go.kr = `NO_OPENAPI_SERVICE_ERROR`/returnReasonCode "12" 만 dead, 코드 11(파라미터 부족)·정상응답은 alive, 코드 30(키 미등록)·05(타임아웃)·네트워크 예외는 **degraded(로그만, 알림 0)**. ② odcloud = `returnReasonCode` 를 안 쓰고 `{"code":-N,"msg":...}` 를 주므로 **`code:-3`("등록되지 않은 서비스", HTTP 404) 만 dead**, `code:-4`(인증키 오류)·411(바디 형식)은 degraded/alive, `currentCount`·`data`·`status_code` 등 양성 증거가 있을 때만 alive (2026-08-29 라이브 실측). ⚠ odcloud 항목에 `flavor` 를 빠뜨리면 판정기가 어긋나 **전부 degraded 로 뭉개져** 그 API 만 감시 사각지대가 된다. ⚠ 국세청 사업자 API 2종(사업자상태 status·진위확인 validate)은 **POST 전용**이라 레지스트리에 `method:"POST"` + 조회 전용 바디를 명시(GET 으로 찌르면 405 라 생사 판별 불가) — 바디 스키마도 서로 다르다(status=`{"b_no":[...]}`, validate=`{"businesses":[{...}]}`). ⚠ **국세청 두 오퍼레이션은 같은 서비스(nts-businessman/v1) 아래여도 각각 등록**한다 — data.go.kr 은 오퍼레이션 단위로도 폐기·개편하므로, 서비스 통째 폐기만 잡으면 되는 청약홈(4 오퍼레이션 → 대표 1개)과 달리 status(휴폐업 차단)·validate(가입 진위확인)는 둘 다 공인중개사 검증의 생명줄이라 개별 감시가 필요하다(세션 394 신설). dead 발견은 잡 실패가 아니라 "완료 + 알림"(CrawlJob completed). 네이버 0, data.go.kr 쿼터 12회라 영향 무시, 토글 API_VERSION_MONITOR_ENABLED(기본 true). ⚠ **새 data.go.kr API 도입 시 `crawler/api_version_monitor.py` PROBE_REGISTRY 에 1줄 추가 의무** — 빠지면 그 API 만 감시 사각지대 (2026-08-19 사고: data.go.kr 이 인증 예외 처리 종료로 구버전 엔드포인트(AptListService3·AptBasisInfoServiceV4 등)를 공지 체감 없이 폐기 → 이 프로젝트·mibunyang 동시 수집기 장애)

### 잡 상세 — 크롤링 모니터

**주기**: 10분 interval

crawl_jobs 정합성 점검 후 텔레그램 알림. ⚠ **알림 문구는 전부 쉬운 우리말이어야 한다**(사장님 지시 2026-09-15, 세션 407 PR #524) — 사전 = `crawler/plain_words.py`(작업이름 `JOB_WORDS` — 개수는 `len(JOB_WORDS)` 로 센다, 세션 410 실측 30 + 에러 번역 `explain_error` + 행동문구 `action_words` + 상태어 `status_words` + 옛 문장 변환 `plainify_detail`). **새 job_type 을 만들면 `JOB_WORDS` 와 FE `crawl-job-labels.ts` 양쪽에 등록**(`tests/test_plain_words.py` 가 양방향 대조로 차단). 알림 문구에 영문 job_type·개발자 에러 원문(psycopg2 등)·`batch`·`running`·`red` 를 다시 넣지 말 것. 저장된 옛 `monitor_alerts.detail` 은 **발송 직전** `plainify_detail()` 로 변환한다(DB 무변경). (운영 토글 MONITOR_ENABLED, 2026-05-25 세션 229 30→10→20 답습 후 현 .env MONITOR_INTERVAL_MIN=10 운영. 기본 _STALE_HOURS=1h — 정상적으로 오래 도는 잡은 _STALE_HOURS_BY_TYPE 예외 의무: public_trade_data 3h(세션 266)·official_price 16h(세션 369 오탐 sweep 실사고 — 새 장시간 잡 추가 시 이 표 동반 등록)·kapt_match 8h·kapt_costs 3h(세션 388 — 배포 전 사전 등록, kapt_match 는 basis 콜 소요 재산정으로 4h→8h). _FAILED_WINDOW_HOURS=24. 전부 monitor.py 상단 상수, 인터벌 격하 무관) **실패 버스트 경보**(세션 396 PR #486): 60분 창 안 같은 job_type failed ≥5 이면 `crawl_failed_burst:<job_type>` 1건 발화 — job_type 단위 "자가복구" 선필터(마지막 failed 뒤 completed 가 있으면 skip)가 배치 부분 실패(9/9 14:45 13/50)를 통째로 은폐하던 사각 보완. 같은 job_type 의 `crawl_failed` 가 활성이면 생략, 쿨다운 6h 공통, 창 이탈 해소 문구는 "추가 실패만 멈춤"(정상 복구 오보 방지), 같은 job_type 의 crawl_failed 로 승계돼 사라진 경우는 "같은 작업의 실패 경보로 이어짐" 문구(세션 397 — 승계를 창 이탈로 오보하던 결함).
