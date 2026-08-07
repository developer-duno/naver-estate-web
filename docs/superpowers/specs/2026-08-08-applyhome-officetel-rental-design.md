# 청약홈 오피스텔·도시형·민간임대 편입 설계 (이슈 #323)

> **상태**: 설계 확정 v1 · 사장님 승인 완료 (2026-08-08) · **API 활용신청 이미 승인 완료, 즉시 구현 가능**
> **선행 조건 없음** — 아래 §1 재조사로 naver-estate-web `.env`의 키가 이미 승인된 정확한 키임을 실측 확인했다. 구현은 바로 착수할 수 있다.

## 0. 왜 이걸 하는가

naver-estate-web은 아파트뿐 아니라 **오피스텔**을 함께 다루는 서비스다(`ABYG`·`OPST`·`OBYG` 매물유형 코드가 이미 존재 — `.claude/rules/codes.md`). 미분양(mibunyang)은 아파트 전문이라 오피스텔·도시형·민간임대 청약 데이터를 범위 밖으로 뺐지만, 그 판단은 mibunyang 서비스 기준이지 이 레포와는 무관하다. 이 레포는 아파트+오피스텔 양쪽을 다루므로 청약 정보도 양쪽을 다뤄야 완결된다.

## 1. 전수조사 결과 — 1차 조사(오판) → 2차 재조사(확정)

**1차 조사(초기)**: naver-estate-web `.env`의 `PUBLIC_DATA_API_KEY`(64자)로 청약홈 6종 API를 직접 호출했을 때 전부 401 "등록되지 않은 인증키"가 나왔다. mibunyang `.env`의 `MOLIT_KEY`(32자)로도 동일 401이 재현됐고, mibunyang 자신의 최신 설계 문서(`F:\mibunyang\docs\superpowers\specs\2026-08-07-applyhome-competition-8ch-design.md` 라인 80-81, 766)가 "오피스텔/도시형/민간임대/생활숙박 — 범위 밖(승인 안 됨)"이라 적혀 있어 "미승인" 결론을 냈다.

**2차 재조사(2026-08-08, data.go.kr 마이페이지 직접 확인)**: 사장님이 로그인한 실제 마이페이지 "활용신청 현황"에서 **"[승인] 한국부동산원_청약홈 분양정보 조회 서비스" — 신청일 2026-03-06, 개발계정, 처리상태 승인**을 확인했다. 이 서비스(카탈로그 15098547) 안에 아파트뿐 아니라 오피스텔·도시형(`getUrbtyOfctlLttotPblancDetail`/`Mdl`)과 공공지원 민간임대(`getPblPvtRentLttotPblancDetail`/`Mdl`) 오퍼레이션이 전부 포함돼 있었다. 상세 페이지의 "일반 인증키" 앞 8자리(`8daf3599`)가 naver-estate-web `.env`의 `PUBLIC_DATA_API_KEY` 앞 8자리와 **정확히 일치** — 즉 naver-estate-web은 처음부터 이미 승인된 정확한 키를 갖고 있었다.

이 발견을 바탕으로 backend에서 6종 API를 재호출하니 **전부 200 성공**했다:

| 채널 | totalCount | 이슈 #323 원문 수치 |
|---|---|---|
| 오피스텔/도시형/생숙 상세 | 608 | 608 (일치) |
| 〃 평형별 | 3,107 | — (원문 미기재) |
| 공공지원 민간임대 상세 | 180 | — (원문 미기재) |
| 〃 평형별 | 988 | — (원문 미기재) |
| 오피스텔/도시형 경쟁률 | 2,679 | 2,679 (일치) |
| 공공지원 민간임대 경쟁률 | 3,952 | 3,924 (며칠 새 자연 증가, 근접) |

**1차 조사가 왜 401을 냈는지는 원인 미상**(스크립트 파라미터 처리 문제 또는 API 서버 측 일시 문제로 추정, 재현되지 않아 확정 불가)이지만, 결과적으로 **미승인이 아니었다**는 사실이 중요하다. 교훈: API 401을 "미승인"으로 단정하기 전에 실제 계정 마이페이지에서 승인 이력을 직접 확인해야 한다 — 코드 레벨의 일시적 오류와 계정 레벨의 진짜 미승인은 겉보기 증상(401)이 같아 구분되지 않는다.

**결론**: 승인 조건이 없다. 바로 구현에 착수할 수 있다.

## 2. 수집 주체 — naver-estate-web 자체 수집

mibunyang의 `collect-applyhome-detail.mjs`(Node.js, GitHub Actions cron)와는 완전히 독립적으로, 이 레포의 기존 백엔드 스케줄러(APScheduler, `crawler/scheduler.py`)에 새 잡을 추가한다. mibunyang에 작업을 요청하지 않는다 — 두 레포는 서로 다른 서비스 목적을 가지므로 이 데이터는 우리가 직접 책임진다.

## 3. 수집 주기 — 주 1회 (월요일)

**근거**: mibunyang이 실측한 동일 계열(청약홈 odcloud.kr, 한국부동산원 시스템) 데이터의 공고 발생 빈도 — "임의공급 공고 연도별 2023:7 / 2024:153 / 2025:300 / 2026:160(7개월)"로 월 평균 약 20~25건 수준. 매일 여러 건씩 쏟아지는 게 아니라 완만하게 느는 패턴이라, 매일 수집할 근거가 없다. 기존 아파트 청약 파이프라인(mibunyang)도 동일 이유로 주1회(월요일) cron을 쓴다 — 같은 API 계열이므로 같은 주기가 합리적이다.

접수 마감 후 경쟁률 반영 시차는 이번 조사에서 시간 경과 관찰까지는 못 했다(시점 스냅샷 1회만 확인). 구현 착수 시점에 실제 마감 임박 공고 사례로 재확인하고, 만약 반영이 늦다면 그 공고에 한해 더 잦은 간격으로 재수집하는 보정 로직을 추가로 검토한다(1차 구현 범위 밖, 필요시 후속 PR).

- APScheduler `crawler/scheduler.py`에 신규 잡 등록: `interval, day_of_week='mon'` 또는 `cron` 트리거.
- `PUBLIC_DATA_API_KEY` 미설정 시 기존 `collect_public_trade_data()` 패턴처럼 조용히 skip + `CrawlJob(status="cancelled")` 기록.

## 4. DB 스키마

### 4-1. 오피스텔·도시형 — 기존 테이블 확장

`backend/db/mb_models.py`의 `PresaleScheduleOfficial`·`ApplyhomeUnitSupply`에 `house_type` 컬럼을 추가한다. 두 API(`getUrbtyOfctlLttotPblancDetail`/`Mdl`)의 필드 구성이 기존 아파트 청약(`getAPTLttotPblancDetail`/`Mdl`)과 거의 동일(공고·일정·평형별 공급)하므로 새 테이블을 파지 않는다.

```sql
-- V040: presale_schedule_official·applyhome_unit_supply 에 house_type 컬럼 추가
ALTER TABLE presale_schedule_official
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN presale_schedule_official.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancDetail)';

ALTER TABLE applyhome_unit_supply
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN applyhome_unit_supply.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancMdl)';
```

기존 행은 DEFAULT로 전부 `'apt'`로 소급 태깅된다. UNIQUE 제약(`apartment_id, house_manage_no`)은 변경하지 않는다 — 오피스텔 공고번호 체계가 아파트와 겹치지 않는지는 마이그레이션 적용 직전 실제 데이터로 재확인하고, 충돌이 발견되면 그때 키를 조정한다(mibunyang 선례와 동일한 안전 절차).

### 4-2. 민간임대 — 신규 전용 테이블 2개

임대료·특별공급 유형(청년/신혼/고령자)이 분양과 개념 자체가 달라 기존 테이블에 억지로 끼우지 않는다.

```sql
-- V041: 공공지원 민간임대 전용 테이블
CREATE TABLE rental_schedule_official (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL,
  pblanc_no TEXT,
  house_nm TEXT NOT NULL,              -- 임대주택명 (아파트처럼 apartment_id 매칭 대상 없음 — 독립 로스터)
  address TEXT,
  recruit_date DATE,
  receipt_bgnde DATE,
  receipt_endde DATE,
  winner_announce_date DATE,
  contract_bgnde DATE,
  contract_endde DATE,
  move_in_ym TEXT,
  tot_supply INTEGER,
  pblanc_url TEXT,
  biz_entity TEXT,
  constructor TEXT,
  region_code TEXT,                    -- SUBSCRPT_AREA_CODE — apartments 테이블과 매칭 안 되므로 지역 필터용
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no)
);
CREATE INDEX idx_rental_schedule_region ON rental_schedule_official(region_code);
COMMENT ON TABLE rental_schedule_official IS
  '청약홈 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail). apartments 테이블과 독립 — 임대주택은 우리 아파트/오피스텔 로스터에 없는 별도 매물.';

-- V042: 민간임대 평형별 공급
CREATE TABLE rental_unit_supply (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL REFERENCES rental_schedule_official(house_manage_no) ON DELETE CASCADE,
  model_no TEXT NOT NULL,
  house_ty TEXT,
  supply_area FLOAT,
  exclusive_area FLOAT,
  contract_area FLOAT,
  general_supply INTEGER,
  youth_supply INTEGER,                -- 청년
  newlywed_supply INTEGER,             -- 신혼
  elderly_supply INTEGER,              -- 고령자
  monthly_rent INTEGER,                -- 월 임대료 (만원)
  deposit INTEGER,                     -- 보증금 (만원)
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no, model_no)
);
COMMENT ON TABLE rental_unit_supply IS
  '청약홈 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).';
```

민간임대 경쟁률(`getPblPvtRentLttotPblancCmpet`, 공급유형 00/SY/SN/SO별)은 1차 구현 범위에서 제외한다 — 공고·평형만 우선 확보해 화면에 노출하고, 경쟁률은 접수 마감 사례가 실제로 쌓인 뒤 필요성을 다시 판단한다(YAGNI, mibunyang의 단계적 접근과 동일한 원칙).

### 4-3. 오피스텔·도시형 API 필드 → 기존 컬럼 매핑

2026-08-08 실호출로 오피스텔 상세 응답 필드 일부(`BSNS_MBY_NM`, `CNTRCT_CNCLS_BGNDE`, `HOUSE_DTL_SECD` 등)를 확인 — 접두어 체계가 기존 아파트 API와 같은 계열(청약홈 공통 스펙)로 보이나, 이번 조사는 응답 인코딩이 깨진 상태(cp949 환경에서 UTF-8 한글 미처리)로 필드명만 확인했고 전체 25필드/9필드 목록과 값 형태(날짜·금액 콤마 등)까지는 대조하지 못했다. 구현 착수 시 실제 응답 전체를 UTF-8로 재확보해 이슈 원문 필드 목록과 1:1 대조 필요. mibunyang 설계 문서의 §3(값 형태 함정 — 날짜 형식·금액 콤마·경쟁률 문자열 파싱)과 동일한 함정이 오피스텔 API에도 있을 수 있으므로, 구현 착수 시 mibunyang 문서 §3의 파서(`toDateFlexible`, 콤마 제거)를 그대로 이식해 재사용한다.

## 5. 화면 — 분양 탭에 새 세그먼트 추가

`frontend/src/components/mb/MbPresaleTab.tsx`의 `PRESALE_SEGMENTS`(현재 `private`/`public`/`competition` 3개)에 `officetel_rental`("오피스텔·임대") 세그먼트를 추가한다.

- 목록: 오피스텔·도시형 공고와 민간임대 공고를 한 목록에 합쳐 보여주되, 각 행에 유형 뱃지("오피스텔"/"임대") 표시.
- 상세: `MbUnitSupplyTable.tsx`를 확장해 `house_type` 컬럼으로 오피스텔 평형 표를 재사용하고, 민간임대는 임대료·보증금·특별공급 유형(청년/신혼/고령자)을 보여주는 별도 서브컴포넌트를 신설.
- 정렬 옵션: 기존 `MB_APT_SORT_OPTIONS`과 별도로, 이 세그먼트 전용 정렬(공고일순·임대료순 등)을 `lib/mb-sort-options.ts`에 추가.
- URL 상태: 기존 `seg` 파라미터 값에 `officetel_rental` 추가, `page.tsx`의 `PRESALE_SEGMENTS` SSOT를 그대로 따름(이미 세그먼트 전환 시 정렬 리셋 로직이 있음 — 재사용).

## 6. BE 라우터

`backend/routers/mb.py`의 `/api/mb/presale` 엔드포인트에 `presale_type` 값으로 `officetel_rental`을 추가하거나, 응답 구조가 크게 다르면 신규 엔드포인트 `/api/mb/presale/officetel-rental`을 분리한다 — 실제 구현 단계에서 기존 쿼리 함수(`db.mb_apartment_queries`)와의 재사용 가능성을 보고 결정.

## 7. 구현 순서

1. 실제 API 응답(UTF-8)으로 필드명·값 형태 최종 재검증 (§4-3 함정 확인)
2. V040~V042 마이그레이션 작성 + prod 적용 (release.md 절차 — SQL Editor 수동 실행)
3. 백엔드 수집 잡 (`crawler/service_public.py` 패턴 재사용, 주1회 스케줄러 등록)
4. 백엔드 라우터·serializer 확장
5. 프론트 세그먼트·컴포넌트 구현
6. 목업 승인 후 화면 구현 (mibunyang 선례 — "화면 부분은 실데이터 확보 후 목업 먼저" 원칙 준용, 세션 488 사고 방지)

## 8. 쿼터 영향

data.go.kr 일 40,000회(mibunyang과 공유). 이슈 원문 규모(오피스텔 608행 + 경쟁률 2,679행 + 민간임대 상세/평형/경쟁률 합계 약 4,000행)를 perPage=1000 전량 페이지네이션으로 수집해도 회당 10회 안팎 — 주1회 실행이므로 쿼터 영향은 무시 가능한 수준(mibunyang 8종 실측 "109회/run, 일일 한도의 1.1%"와 같은 결).
