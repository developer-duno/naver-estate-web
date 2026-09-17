# 데이터 수집기 백서

> **무엇을 위한 문서인가**: "이 데이터가 왜 안 쌓이지?" 할 때 **어디를 봐야 하는지**를 찾는 지도.
>
> ⚠ **수치는 최소한만 적는다.** 문서에 적힌 숫자는 반드시 낡는다 — 실제로 2026-09-13 조사에서
> "이 키는 응답에 없다"는 코드 주석이 **사실이 아님**을 라이브로 확인했고, 자매 레포 주석의
> "시세 이력은 naver-estate-web 이 관리"도 **코드와 어긋난다**는 것이 실측으로 드러났다.
> 실시간 수치는 관리자 화면(`/admin` 스케줄러 현황·신선도 카드)에서 본다.
>
> 최초 작성 2026-09-13(세션 402). 조사 = 코드 직독 + prod 실측(문서 미신뢰 원칙).

---

## 1. 한눈에 보기 — 두 프로젝트가 한 창고를 쓴다

`naver-estate-web`(이하 **우리**)와 `mibunyang`(이하 **자매**)는 **같은 Supabase DB** 를 공유한다.
자매 `_shared.mjs` 의 `getSupabase()` 와 `getMibuyangSupabase()` 는 이름만 다르고 **같은 URL·같은
public 스키마**에 붙는다(코드 직독 확인) — 이름만 보고 "다른 DB"로 오해하기 쉬운 함정.

| 테이블 | 소유 | 비고 |
|---|---|---|
| `articles` · `complexes` | **양쪽 write** | 우리가 주 writer. 자매도 씀(§3) |
| `complex_price_history` | **양쪽 write** | ⚠ 자매 주석은 "우리가 관리"라 적혔으나 **실제로 자매도 쓴다**(§5-1) |
| `infra` | **양쪽 write** | 컬럼이 프리픽스로 분리돼 있음(§3) |
| `trades` | 자매 단독 write | 우리는 **read-only** |
| `apartments`·`regions`·`prices`·`schools`·`transport`·`builders`·`unsold_history` 등 | 자매 전용 | 우리는 미분양 화면에서 읽기만 |
| `kapt_*`·`complex_official_price`·`officetel_*`·`rental_*`·`crawl_jobs`·`monitor_alerts` 등 | 우리 전용 | |

**규모 감각** (2026-09-13 `pg_stat_user_tables` 실측 — 추이만 참고, 정확한 현재값은 관리자 화면):
articles 약 150만 행 988MB · trades 약 105만 행 · complex_price_history 약 40만 행 · complexes 약 6.4만 행.

---

## 2. 우리 수집기 — 어디서 가져오는가

**정본은 코드다.** 잡 목록·주기 = `backend/crawler/scheduler.py` 의 `scheduler.add_job(... id="...")`,
화면 표시 문구 = `backend/routers/admin/scheduler.py` 의 `SCHEDULER_JOB_META`.
아래 표는 "출처(호스트)"를 찾기 위한 지도이며, **주기는 적지 않는다**(바뀌면 낡으므로 —
`release.md` §3-0 전수 시각표와 관리자 화면이 정본).

| 잡 id | 출처 호스트 | 쓰는 테이블 |
|---|---|---|
| `discover_regions` · `crawl_articles` · `crawl_details` · `popular_*` · `complex_detail_*` · `collect_prices` | `new.land.naver.com` | articles · complexes · complex_price_history |
| `backfill_price` · `collect_public_trades` | `apis.data.go.kr/1613000` (국토부 실거래가 RTMSDataSvcAptTrade) | complex_price_history |
| `kapt_match` | `apis.data.go.kr/1613000` (AptListService4, AptBasisInfoServiceV5) | kapt_complex_map |
| `kapt_costs` | `apis.data.go.kr/1613000` (AptCmnuseManageCostServiceV3, AptIndvdlzManageCostServiceV3) | kapt_management_costs |
| `collect_air_quality` | `apis.data.go.kr/B552584` (에어코리아) | infra · air_quality_stations |
| `collect_emergency` | `apis.data.go.kr/B552657` (응급의료 ErmctInfoInqireService) | infra |
| `collect_childcare` | `api.childcare.go.kr` (CPMS cpmsapi030) | infra |
| `collect_crime_stats` | `api.odcloud.kr/api/3074462` (경찰청) | infra |
| `collect_officetel_presale` · `collect_rental_presale` | `api.odcloud.kr/api/ApplyhomeInfoDetailSvc` (청약홈) | officetel_* · rental_* |
| `official_price` | `api.vworld.kr/ned/data` (공동주택 공시가격) | complex_official_price |
| `api_version_probe` | data.go.kr 계열 엔드포인트 최소호출(생사 확인) | — (알림만) |
| `collect_metrics` · `vacuum_maintenance` · `crawler_monitor` · `billing_charge` | **외부 없음**(DB 집계·유지보수·PortOne 결제) | complexes · monitor_alerts 등 |

> 공인중개사 검증(온디맨드)은 `api.odcloud.kr/api/nts-businessman`(국세청 사업자 상태·진위).

**출처 URL 의 단일 출처(SSOT)** = `backend/crawler/api_version_monitor.py` 의 `PROBE_REGISTRY`.
새 외부 API 를 도입하면 **거기에 1줄 추가**해야 생사 감시 대상이 된다(안 넣으면 그 API 만
감시 사각지대 — 2026-08-19 구버전 엔드포인트 폐기 사고의 원인).

---

## 3. 공유 테이블 충돌 지도 — 가장 중요한 절

### 3-1. `articles`

| 누가 | 보내는 컬럼 | 위험 |
|---|---|---|
| **우리** 목록 크롤 | 가격·면적·층·방향·`is_active`·`last_seen_at` 등 | — |
| **우리** 상세 크롤 | `heating_type`·`jibun_address`·`use_approve_ymd`·`room_count`·`maintenance_cost`·`detail_crawled` 등 | — |
| **자매** `naver-collect.py` (월·목 08:00 이 PC 작업 스케줄러) | 가격·면적·층·방향·`is_active`·`last_seen_at` **만** | **안전** — 상세 필드를 **안 보냄**. upsert 는 보낸 컬럼만 덮으므로 우리 상세값 보존 |
| **자매** `naver-listings.mjs` | 위 + `heating_type`·`use_approve_ymd`·`room_count`·`bathroom_count`·`numeric_maintenance_cost`·`move_in_date` 를 **명시적 `null`** 로 | ⛔ **실행되면 우리 상세값을 지운다.** 단 **어느 자동 실행에도 안 걸려 있음**(자동실행 31개·배치 3개·package.json·자매 자체 고아 점검 스크립트 4중 확인). 자매도 "실행 경로 0이 의도된 상태"로 등록 |

**실증(2026-09-13)**: 테스트 행에 우리 값을 넣고 자매 방식(명시 null upsert)을 재현하니
값이 **실제로 지워졌다**. 반면 자매가 안 보내는 컬럼(`jibun_address`)은 **보존**됐다.
→ "보낸 컬럼만 덮어쓴다"가 실측으로 확인된 원리.

### 3-2. `complexes`

자매 `naver-collect.py` 가 단지 메타(이름·좌표·세대수·준공일·시공사)와 `last_crawled_at` 을 쓴다.
⚠ **`last_crawled_at` 일괄 스탬프**: 자매가 bbox 마커로 받은 단지 **전량**에 이 시각을 찍는다
(`naver-collect.py:478`). 2026-09-09 에 30,328건이 한꺼번에 찍혔다.
→ 그래서 우리는 **`articles_crawled_at`(V058)** 을 따로 만들었다. 우리 목록 크롤이 **완주**했을
때만 찍히므로 배치 선정 키로 쓸 수 있다. `last_crawled_at` 을 선정 키로 쓰지 말 것.

### 3-3. `infra`

PK 가 `apartment_id`(자매 `apartments.id`)인 **자매 소유 테이블**인데 우리도 쓴다.
컬럼이 프리픽스로 갈려 있어 **직접 충돌은 없다**:

- 자매: `hospital*`·`mart*`·`conv*`·`cafe*`·`culture*`·`bank*`·`pharmacy*`·`park*`·`subway_dist`·`childcare`·`emergency`·`police`
- 우리: `emergency_hospital*`·`emergency_beds`·`emergency_level`·`air_*`·`childcare_count`·`childcare_nearest_*`·`crime_score`·`crime_grade`·각 `*_updated_at`

⚠ **공용 `updated_at` 은 양쪽이 갱신**한다 → 신선도 판정 키로 쓰면 상대 갱신에 오판한다.
그래서 우리는 `air_attempted_at`·`emergency_updated_at`·`childcare_updated_at` 등 전용 시각
컬럼(V053~V055)을 따로 뒀다. **새 수집기도 전용 시각 컬럼을 쓸 것.**

⚠ 이름이 비슷한데 다른 컬럼이 병존한다(자매 `emergency` vs 우리 `emergency_hospital`).
화면·집계에서 어느 쪽을 보는지 헷갈릴 수 있다.

### 3-4. `complex_price_history` — 양쪽 write (2026-09-13 발견)

자매 `naver-collect.py:357` 이 같은 충돌키(`complex_no,trade_type,area_no,base_month`)로 upsert 한다.
**자매 파일 상단 주석에는 "시세 이력은 naver-estate-web 이 관리"라고 적혀 있으나 코드는 계속 쓴다.**

**실측(2026-09-13)**: 9/10(목) 08~10시에 486행이 기록됐는데 그 시각 우리 잡은 없었다(우리는
매일 03:30·수 04:00·토 05:00). 자매 로컬 작업이 월·목 08:00 에 돈다 → 자매가 쓴 것.
**중복 키 행은 0건** — 행이 늘지 않고 덮어쓰기만 되므로 데이터 파손은 없다.
시간대가 갈려 실질 경합도 낮다. **현재 조치 없음(기록만)** — 사장님 결정 2026-09-13.

### 3-5. `trades`

자매 `collect-trades.mjs` 단독 write. 우리는 **읽기만** 한다(신선도 카드). 우리 쪽 write 코드 0건.

---

## 4. 외부 API 쿼터 공유 — 겹치면 한쪽이 굶는다

| 출처 | 쓰는 쪽 | 쿼터 |
|---|---|---|
| `api.childcare.go.kr` (어린이집) | 우리 + 자매 | **일 1,000건, 같은 키 공유(확정)**. 자매가 04:30 에 전량 소진 → 우리는 **01:00 고정**. ⚠ 04:30 이후로 옮기지 말 것 |
| `apis.data.go.kr/1613000` (국토부) | 우리 + 자매 | 일 10,000 공유. 매월 10일이 토요일이면 우리 토요일 수집을 skip |
| `apis.data.go.kr/B552584`·`B552657` (대기질·응급의료) | 우리 + 자매 | 같은 활용신청 키면 공유 가능성 — **미확인** |
| `api.odcloud.kr` | 우리 + 자매(청약홈) | 키 공유 여부 **미확인** |
| `api.vworld.kr` | 우리만 | 개발키 만료 **2027-02-09** |
| `new.land.naver.com` | 우리 + 자매 | **쿼터가 아니라 같은 집 IP** — 차단 위험. 시간 분리표 = `.claude/rules/infra.md` §네이버 크롤링 시간 분리 |
| `dapi.kakao.com`·`kosis.kr`·NEIS·DART | 자매만 | |

---

## 5. 장애 대응 런북 — "데이터가 안 쌓인다" 증상별

### 5-1. 어떤 항목이 통째로 비어 있다 (값이 NULL)

**가장 먼저 의심할 것 = 네이버가 키 이름을 바꿨다.** 에러도 경보도 안 난다(HTTP 200 정상 응답).

- 확인: `backend/crawler/field_drift_monitor.py` 가 매일 채움률을 재고 임계 미달이면 텔레그램 알림.
- 수동 확인: 매물 1건의 상세 응답을 받아 우리 파서가 찾는 키가 실제 있는지 대조.
  파서가 읽는 키 = `backend/shared/domain/article.py` 의 `update_from_detail`(5개 블록:
  `articleDetail`·`articleAddition`·`articleRealtor`·`articleTax`·`articlePhotos`).
- **전례(2026-09 발견, 최소 6개월 방치)**: `heatingTypeName`→`aptHeatMethodTypeName`,
  `useApproveYmd`→`aptUseApproveYmd`, `jibunAddress`→`exposureAddress`,
  `totalFloorCount` 는 **`articleFloor` 블록으로 이사**.
  패턴 = 아파트 전용 필드에 `apt` 접두사가 붙고, 관련 필드가 별도 블록으로 묶임.
- ⚠ **매물 유형별로 구조가 다를 수 있다.** 오피스텔 관리비는 `articleDetail.maintenanceCost` 가
  null 이고 `administrationCostInfo` 블록에 온다. 아파트만 보고 판단하지 말 것.

### 5-2. 특정 잡이 안 돈다 / 실패한다

1. 관리자 화면 스케줄러 현황 — 마지막 실행·다음 실행·성공률
2. `crawl_jobs` 테이블 — `status='failed'` 의 `error_message`
3. 토글이 꺼졌나 — 대부분의 수집기가 코드 기본값 `false`(로컬·CI 오발사 방지). 운영은 `.env` 에서 켠다
4. 크롤링 모니터(10분 간격)가 텔레그램으로 알린다. `monitor_alerts` 에 `status='active'` 확인

### 5-3. 외부 API 가 폐기됐다

`api_version_probe`(주 1회)가 12종 엔드포인트 생사를 확인해 알린다.
⚠ **새 API 도입 시 `PROBE_REGISTRY` 에 등록하지 않으면 그 API 만 감시 사각지대.**

### 5-4. 자매 때문에 우리 값이 사라졌다고 의심될 때

§3 충돌 지도로 그 컬럼을 누가 쓰는지 확인 → 자매가 그 컬럼을 보내는지 코드 확인 →
`updated_at` 시각대로 누가 썼는지 추정(우리 잡 시각은 `release.md` §3-0, 자매는 §6).

### 5-5. 서버·DB 자체가 이상하다

`backend/.claude/details.md` §Supabase DB 전면 다운 런북과 재발 이력 · `.claude/rules/release.md` §3 재시작 절차.

---

## 6. 자매(mibunyang) 실행 경로 — 설정 파일만 보면 놓친다

⚠ **자매 수집기 상당수가 GitHub 자동실행이 아니라 이 PC 의 Windows 작업 스케줄러에서 돈다.**
data.go.kr·kosis.kr·api.childcare.go.kr 가 해외 클라우드 IP 를 차단해 로컬로 옮긴 것.
`.github/workflows/*.yml` 만 보면 "안 도는 줄" 오판한다.

| 등록된 작업 | 내용 |
|---|---|
| `MibunyangNaverCollect` (월·목 08:00) | `run-naver-local.bat` 6단계 — **articles·complexes·complex_price_history write** |
| `MibunyangKosisLocal` | 일자별 분산 — 국토부 실거래(`collect-trades`)·응급의료·KOSIS 9종 등 |
| `MibunyangChildcareLocal` | 어린이집 3종 (매일 04:30, 우리 쿼터와 공유) |

GitHub 자동실행(대부분 자매 전용 테이블): 매일 04:00 단지 동기화 체인 · 매일 05:30 교통/인프라/학교 ·
매월 1일 어린이집·경찰·환경 · 매월 7·21일 실거래 통계 등. 정확한 목록은
`F:/mibunyang/.github/workflows/` 와 `F:/mibunyang/scripts/*.bat` 직독.

---

## 7. 과거 사고 기록 (같은 실수 반복 방지)

| 시기 | 사고 | 교훈 |
|---|---|---|
| 2026-03 이전 ~ 2026-09 | 네이버 키 드리프트로 상세 3필드가 **6개월 넘게 100% NULL**. 에러 0, 경보 0 | 에러 없는 장애가 있다 → 채움률 감시 신설 |
| 2026-09-13 | 위와 같은 원인으로 `total_floor_count` 도 100% NULL, 오피스텔 관리비 0.5% | 유형별로 응답 구조가 다르다 |
| 2026-04-13 | `complexes.last_crawled_at` 을 SQL 로 일괄 UPDATE — "크롤된 것처럼" 보여 진단이 장기간 오염 | 크롤 지표는 **실제 크롤 코드만** 갱신 |
| 2026-09-09 | 자매가 bbox 마커 30,328건에 `last_crawled_at` 일괄 스탬프 | 공유 컬럼을 선정 키로 쓰지 말 것 → `articles_crawled_at` 신설 |
| 2026-09-13 | 자매 주석 "시세는 naver-estate 가 관리" 가 코드와 불일치 | **문서를 믿지 말고 코드·데이터를 실측** |

---

## 8. 관련 문서

| 무엇 | 어디 |
|---|---|
| 잡 전수 시각표·재시작 절차 | `.claude/rules/release.md` §3-0, §3 |
| 스케줄러 표·쿼터 공유 | `.claude/rules/infra.md` |
| 잡 상세·DB 다운 런북·운영 배경 3절 | `backend/.claude/details.md` |
| 네이버 IP 차단 방지 절대 규칙 | `.claude/rules/infra.md` §IP 차단 방지 |
| 공유 DB 마이그레이션 주의 | `.claude/rules/infra.md` §공용 테이블 규칙 |
| 코드↔화면 표시 drift 방지 | `.claude/rules/derived-display-ssot.md` |
