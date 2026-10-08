# "이 동네는" 카드 — SGIS 동네 통계 설계서 (1차: 읍면동)

작성 2026-10-08 세션452(Fable) · 상태 **사장님 확정(2026-10-08 07:5x — A안·읍면동 1차·홍수/산사태 포함·오래된 집 = 2004년 이전·재해 문구 시안 그대로)** · 공동 착수 = 2u(수집·표·화면) + 미분양(서랍 읽기) + 상가(키 공용·집계구 원자료 보유)
조사 정본 = `~/.claude/projects/f--mibunyang/memory/handoff_from_2u_2026-10-08_sgis_survey.md` (API 실측·코드표·파일 구조·세 레포 합의)

## 1. 목표와 범위

- **손님 화면**: 단지 상세 "단지정보" 상자를 열면 아래에 작은 제목 **"이 동네는"** 과 줄 6개 — 사는 사람(인구·평균나이) · 1인가구 비율 · 집 종류(아파트·오피스텔·다세대·단독 비율) · 오래된 집 비율 · 일터(사업체·종사자) · 홍수·산사태(동네 안 영향 구역 유무). 시안 = https://claude.ai/artifact/23xMb8Gtfje5Kt3ukUMtAn A안. 맨 아래 출처 한 줄(공공누리 1유형 의무).
- **단위**: 단지가 속한 **행정동(SGIS 코드 8글자)**. 집계구(14글자)는 2차 — 원자료는 상가 폴더 `D:/sangga/data/raw/sgis_census/req87909_2026-10-08/` 에 이미 있다.
- **쓰는 곳**: 2u 단지 상세(아파트·오피스텔 6만 쪽, 중개사 상담 근거 + SEO 고유 문장) · 미분양 "이 지역 통계" 서랍 읍면동 줄(같은 표 읽기) · 상가는 나중.
- **서비스 성격**: 2u·미분양 모두 **무료 정보 제공**(사장님 확인 2026-10-08) → 출처 표기만 지키면 됨. 유료 전환(`PAYMENT_ENABLED`) 때 사이트 약관 15·16조(영리 이용 사전 승낙) 재확인.
- **안 하는 것**: 지도·경계 그리기(영구 제외) · 자가/전세/월세 비율(2015 이후 센서스에 없음) · 살고싶은우리동네 CSV(지표 4개·2022·구간값) · 화면 전용 서비스(실거래가·안전지수 등은 API·파일 없음).

## 2. 자료원 (실측 2026-10-08)

| 무엇 | 어디 | 주기 | 호출/크기 |
|---|---|---|---|
| **읍면동 통계 본체** | 공공데이터포털 **15129688** 「국가데이터처_SGIS 행정구역 통계 및 경계_20250630」 zip(269MB, 로그인 0). `1. 통계/` CSV 19개 = `기준연도,행정구역코드,통계항목,통계값` 4열 cp949, 코드 길이 2/5/8글자 섞임 · 코드집 `3. 코드집/2. 제공용 코드(statistics_code).xlsx` | 반기 등록·우리는 **연 1회** | 파일 1개 |
| 단지 → 행정동 코드 | `OpenAPI3/addr/rgeocodewgs84.json?x_coor=경도&y_coor=위도&addr_type=20` → `sido_cd+sgg_cd+emdong_cd` 이어 붙여 8글자(WGS84 그대로 OK) | 단지당 1회(새 단지만 추가) | 6만 콜 1회(5만/일 → 2일 분할) |
| 보조 요약(읍면동 코드 1콜씩) | `startupbiz/housesummary.json`(거처종류 — **오피스텔 분리**) · `pplsummary.json`(연령 7구간) · `corpdistsummary.json`(업종 비율, 부동산중개업 1006) | 연 1회 | 읍면동 ~3,500 × 3 ≈ 10,500 콜 |
| 홍수·산사태 | `ndsm/floodRiskAdmCdList.json?adm_cd=<시도 2글자>`·`lndsldWarnAdmCdList.json`(영향 읍면동 목록, base_year 2025) → **목록에 있는 읍면동만** `…DataBoard.json?adm_cd=<읍면동 8글자>`(없는 동은 HTTP 500) · 항목 9개 중 인구·가구·주택·지하건물의 `affc_zone`(영향구역)·`administ_zone`(동 전체) | 연 1회 | 17×2 목록 + 영향 읍면동 수천 콜 |
| 인증 | `auth/authentication.json?consumer_key&consumer_secret` → accessToken(4시간, `accessTimeout` 밀리초) · env `SGIS_CONSUMER_KEY`·`SGIS_CONSUMER_SECRET`(세 레포 같은 이름) | 호출마다 캐시 | 한도 공식 5만/일(intro 원문) |

값 규칙: 작은 수 **"N/A"** → NULL · 집계구 코드·경계는 해마다 바뀜(2차 때 연도 동반) · `const_year` 코드는 기준연도마다 뜻이 다름(파일 CSV 는 코드표로 **구간 라벨**로 바꿔 저장) · 시도 코드는 SGIS 자체(세종 29·전남 36).

## 3. 기존 수집기 대체 판단 (사장님 질문 2026-10-08)

2u 스케줄러 26잡 중 **SGIS 로 대체할 수 있는 수집기는 없다.** 이유 = 우리 수집기는 "단지 반경·시설 단위·월별"인데 SGIS 는 "행정동 단위·연 1회 통계"라 단위가 다르다.

| 기존 수집기 | SGIS 에 비슷한 것 | 판정 |
|---|---|---|
| 어린이집(`collect_childcare`, CPMS 키 1,000/일 공유) — 단지 반경 가장 가까운 시설·정원·교사 | 사업체 테마 7007 "어린이보육업" **동별 개수**만 | ✗ 대체 불가(거리·정원 없음). 보완용 "동네 어린이집 N곳" 줄은 가능 |
| 응급의료(`collect_emergency`) — 반경 응급실·병상·등급 | 자료 시점 현황에 "응급의료시설현황" 있으나 **화면 전용** | ✗ |
| 범죄(`collect_crime_stats`, 분기) — 시군구 범죄 등급 | 범죄안전지수(행안부) **화면 전용** · 통계주제도 005 도 API 없음 | ✗ |
| 관리비(`kapt_costs` 3회차)·공시가격(`official_price`)·실거래가(`collect_public_trades`) | 자료 시점 현황에 있으나 전부 **화면 전용**(살고싶은 우리동네) | ✗ |
| 지하철역(파일 1회) | 버스정류장·지하철 위치(국토부) — 화면 전용 | ✗ |
| 단지 가치지표(`collect_metrics`) — 우리 시세 집계 | 없음 | ✗ |
| 미분양 KOSIS 9종(시군구 주민등록 **월별** 인구·가구) | 센서스 인구·가구(연 1회) | ✗ 주기·출처가 달라 대체 아님(미분양 판단) |

**새로 얻는 것만 있다**: 행정동 인구·연령·1인가구·집 종류(오피스텔 분리)·건축년도·업종별 사업체·홍수/산사태 영향 — 모두 지금 수집기에 없던 층.

## 4. 공유 DB (Supabase `rwdtljipvmqpazrimyns`) — 마이그 V071

```sql
-- V071__sgis_area_stats.sql  (새 표 → mibunyang 기준선 재승인 대상: 만든 날 미분양 창에 한 줄)
CREATE TABLE sgis_area_stats (
  adm_cd     text        NOT NULL,            -- SGIS 행정구역코드 2/5/8글자 (1차는 8글자만 적재)
  year       smallint    NOT NULL,            -- 통계 기준연도 (2024)
  item_code  text        NOT NULL,            -- 파일: to_in_001·in_age_009·ho_gb_002 … / 보조 API: api_officetel_cnt·api_corp_1006_per … / 재해: ndsm_flood_affc_pop … / 이름: adm_nm
  value      numeric,                         -- "N/A" → NULL
  value_text text,                            -- adm_nm 같은 글자 값
  loaded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (adm_cd, year, item_code)
);
CREATE INDEX sgis_area_stats_item_idx ON sgis_area_stats (item_code, year);
ALTER TABLE sgis_area_stats ENABLE ROW LEVEL SECURITY;        -- 정책 0 · anon/authenticated 권한 회수 (site_opinions 모양)
REVOKE ALL ON sgis_area_stats FROM anon, authenticated;

ALTER TABLE complexes ADD COLUMN sgis_emd_cd text;             -- 열 추가 = 기준선 영향 0
ALTER TABLE complexes ADD COLUMN sgis_mapped_at timestamptz;
CREATE INDEX complexes_sgis_emd_idx ON complexes (sgis_emd_cd);
```

- long 표 하나로 파일·보조 API·재해를 다 담는다(raw jsonb 불필요). 화면은 BE 가 **고정 item_code 목록**으로 조립.
- 미분양은 `apartments` 에 자기 매핑 열을 더하고 이 표를 읽기만(service_role 경유). 미분양용 item_code 목록은 §8.
- 백업: 새 표·열 추가만이라 스키마 덤프 1회(infra.md §DB 백업).

## 5. 수집·적재 (backend)

1. `scripts/load_sgis_stats.py <zip경로> [--year 2024]` — zip 안 `1. 통계/*.csv` 전부 → 8글자 행만 upsert(2/5글자는 미분양·상가가 필요하면 플래그로). 코드표 xlsx 로 `const_year` 구간 라벨 item(`ho_cy_label_<구간>`)도 생성. 1차는 **수동 1회**(zip 은 사람이 내려받아 경로 지정 — data.go.kr 다운로드는 폼 POST 라 자동화는 후속). 멱등.
2. `scripts/map_complex_sgis.py` — `complexes.sgis_emd_cd IS NULL AND latitude IS NOT NULL` 을 0.2초 간격으로 `rgeocodewgs84` 호출(네이버가 아니라 `AdaptiveThrottle` 불필요, 하루 4만 콜 상한·중단 재개 가능). 결과 8글자 + `sgis_mapped_at`. 실패(-100)는 NULL 유지 + 로그.
3. `crawler/service_sgis.py` — 잡 1개 `sgis_area_refresh`(연 1회, 매년 **2월 첫째 일요일 05:00** — 파일 반기 등록 뒤·다른 새벽 잡과 안 겹침): 보조 API 3종 × 읍면동 + 재해 목록·상세 → upsert. `CrawlJob(job_type="sgis_area")` 기록 · 429/5xx 는 실패로 세고 연속 20회면 failed(error-propagation 5). 새 잡 등록 위치 = `reference_known_traps.md` "새 잡 등록 6곳"(scheduler.py id · META 표시 · `JOB_WORDS` + FE `crawl-job-labels.ts` · release.md 시각표 생성 · 관리자 수집 버튼 · 시험).
4. 알림 문구(텔레그램·관리자 화면) 쉬운 우리말(infra.md §텔레그램).

## 6. API (backend `routers/complexes.py` 선례 = `/{complex_no}/subway`:380)

`GET /api/complexes/{complex_no}/neighborhood` → 200
```json
{ "emd_cd": "11230640", "emd_nm": "역삼1동", "year": 2024,
  "population": 33819, "avg_age": 41.3,
  "one_person_pct": 67.4, "households": 21140,
  "house_mix": { "apt_pct": 13.7, "officetel_pct": 18.5, "row_pct": 27.5, "detached_pct": 31.9 },
  "old_house_pct": 57.1, "old_house_cutoff": "2004년 이전",
  "corp_cnt": 18381, "worker_cnt": 176522, "broker_pct": 3.02,
  "flood": { "affected": false }, "landslide": { "affected": true, "pop": 8578, "pop_total": 19840, "year": 2024 },
  "source": "국가데이터처 통계지리정보 센서스 2024, 홍수·산사태 위험지도 2025" }
```
- 단지에 `sgis_emd_cd` 가 없거나 표에 그 동이 없으면 **404** (FE 는 섹션 생략). `Cache-Control: max-age=3600`(하위 경로 규칙). 인증 불필요(공개 통계).
- 비율 산식: 1인가구 = `ga_*`(A0 상당 item) ÷ 총가구 · 집 종류 = housesummary 비율 그대로(분모 = 거처 전체) · 오래된 집 = 건축년도 구간 라벨 합(2004 이전) ÷ 총주택 · 값이 NULL 이면 그 줄 생략.

## 7. 화면 (frontend)

- `lib/api/complex.ts` 에 `getComplexNeighborhood(no)` — 404 는 `null`, 5xx 는 throw(error-propagation 룰, 래퍼 MSW 가드 1건).
- `ComplexBasicInfo.tsx`: 기존 `rows` 아래 **구분선 + 소제목 "이 동네는"** + 줄 6개(시안 A안 문구) + 출처 줄. 로딩 중엔 소제목 없음 · 에러면 "동네 통계를 불러오지 못했어요" 한 줄. 인쇄 모드 포함.
- 문구 규칙: 숫자는 `toLocaleString`·소수 1자리 · 재해 줄 = 영향 없음 `위험지도 영향 구역 아님` / 있음 `동네 안에 홍수위험 구역 있음 — 동네 19,840명 중 8,578명` (단지가 위험하다는 뜻이 아님을 "동네 안에"로). 광고법 게이트(`check:ad-compliance`) 단어 금지.
- 시각 회귀: 단지정보 상자를 **연 상태**를 찍는 baseline 이 있으면 그 장만 CI dispatch 재촬영(`frontend/e2e/README.md`), 카드 응답은 `page.route` mock 고정.
- 상자 4개·배치 불변 → `ComplexDashboard` 손 안 댐.

## 8. 미분양에 줄 것 (설계서 확정 뒤 한 줄로 전달)

표 = `sgis_area_stats`(8글자, year 2024) · item_code: (`adm_nm` 동 이름은 1차 적재에 없음 — 출처 후보 ① 매핑 응답 `emdong_nm`(추가 호출 0, 단지 있는 동만) ② 경계 dbf(전국), PR ② 에서 정해 알림) · `to_in_001` 총인구 · `to_in_002` 평균나이 · `to_in_004` 노령화지수 · `to_ga_001` 총가구 · `ga_sd_005` 1인가구(코드집 실측 — 역삼1동 14,255 = API 값) · `to_ho_001` 총주택 · `ho_gb_003` 아파트(⚠ `ho_gb_002` = 단독주택 — 코드집 실측 2026-10-08 s454) · `ho_cy_label_<시작>_<끝>` 건축년도 구간(value_text = 라벨 원문 · 원자료 항목은 `ho_yr_001~020` — 2024 파일은 코드집 "2015년 이후" 표: 001 1979년 이전·002 1980~89·003 1990~99·004 2000~04·005 2005~09·006~020 2010~2024 단년) · `to_fa_010` 사업체 · `to_em_020` 종사자 · `api_officetel_cnt` · `api_corp_1006_per` · `ndsm_flood_affected`·`ndsm_flood_affc_pop`·`ndsm_flood_adm_pop`·`ndsm_flood_affc_hh`·`ndsm_flood_affc_house`·`ndsm_flood_affc_basement`·`ndsm_flood_year` + `ndsm_lndsld_*` 같은 모양.

## 9. PR 쪼개기 (각각 재시작 창 1회, 2·3은 묶어도 됨)

| PR | 내용 | 검사 |
|---|---|---|
| ① V071 + `load_sgis_stats.py` + `map_complex_sgis.py` | 표·열 · 파일 적재(2024 전국 8글자) · 매핑 1회 실행(2일) | 파서 단위시험(4열·N/A·코드 길이)·멱등 · 미분양 기준선 재승인 · 마이그 리뷰어 |
| ② `service_sgis.py` + `/neighborhood` API | 보조 API·재해 수집 · 응답 조립 | 실패 집계(429·500)·목록 밖 동 상세 금지 · 캐시 헤더 200 만 · 외부 호출 총량 변경 = 적대 Opus 2명 규칙 |
| ③ FE 카드 | 래퍼·rows·문구·출처 | 래퍼 5xx reject 가드 · rows 렌더 · 시각 회귀 1장 · ad-compliance |
| ④ 스케줄러 잡 + 관리자 버튼 + 알림 문구 | 연 1회 자동 · 등록 6곳 | `test_plain_words`·시각표 생성기·release 4중 |

## 10. 사장님 결정 (2026-10-08 확정)

1. **오래된 집 기준** = "2004년 이전 지은 집"(20년 넘음) — 자료 구간(2000~2004)과 맞음.
2. **재해 줄 문구** = 시안 그대로: 없으면 `위험지도 영향 구역 아님`, 있으면 `동네 안에 홍수위험 구역 있음 — 동네 N명 중 M명`.

## 11. 미확정·후속

- data.go.kr zip 자동 내려받기(폼 POST) — 1차는 수동, 되면 ④에 합침.
- 2차 집계구: 상가 폴더 CSV + 경계 SHP(shapely 보유) 또는 `transcoord` 1콜 — 그때 설계.
- ⚠ `adm_nm`(행정동 이름)은 통계 CSV 에 없다(경계 dbf 에만) — PR ① 은 안 넣음, PR ② 에서 이름 출처 정하기(s454 실측).
- 2u 단지 중 좌표 없는 단지 수·매핑 실패율은 ① 실행 뒤 실측해 적는다.
