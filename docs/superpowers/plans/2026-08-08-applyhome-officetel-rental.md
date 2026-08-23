# 청약홈 오피스텔·도시형·민간임대 편입 Implementation Plan

> **상태: 완료** — 이슈 #323 · PR #326 머지 + 후속 P0 FK 드리프트 근본수정 #352(V045, 세션 358). 스케줄러 월요일 05:00/05:30 정기 운영 중(infra.md). 본 문서는 설계·구현 기록.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 청약홈 오피스텔·도시형 API 2종(`getUrbtyOfctlLttotPblancDetail`/`Mdl`)과 공공지원 민간임대 API 2종(`getPblPvtRentLttotPblancDetail`/`Mdl`)을 naver-estate-web이 자체 수집해, `/mibunyang` 페이지 "분양" 탭에 새 세그먼트("오피스텔·임대")로 노출한다.

**Architecture:** 오피스텔·도시형은 기존 `presale_schedule_official`·`applyhome_unit_supply` 테이블에 `house_type` 컬럼을 얹어 확장(아파트와 스키마 동일, `apartment_id`로 기존 로스터와 연결). 민간임대는 `apartments` 테이블 로스터에 없는 별도 매물이므로 `rental_schedule_official`·`rental_unit_supply` 신규 테이블로 완전히 독립시킨다. 수집은 APScheduler 주1회(월요일) 신규 잡, 기존 `crawler/service_public.py`의 job 기록·에러 처리 패턴을 재사용한다.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), Next.js 16 + React Query + TypeScript (frontend), Supabase PostgreSQL, curl_cffi(공공데이터 HTTP 클라이언트)

## Global Constraints

- 한 단계(commit)에 파일 3개 이하, 파일당 100줄 이하 변경 (루트 `CLAUDE.md` §Goal-Driven Execution)
- 마이그레이션은 `db/migrations/V0NN__*.sql`, 실행은 Supabase SQL Editor 수동(자동 러너 없음, `backend/CLAUDE.md`)
- backend 스케줄러·라우터·모델 변경 PR 머지 후 release.md §2 zombie cross-check 의무 (orchestrator.pid mtime + backend.log 부팅시각 + crawl_jobs 최신 row)
- 새 정렬 옵션은 FE `lib/mb-sort-options.ts` + BE `routers/mb.py` Literal 양쪽 동시 갱신 (`domain-mapping-ssot.md` 룰1 — 한쪽만 고치면 422)
- 새 기능은 최소 정상 케이스 1개 + 에러 케이스 1개 테스트 동반 (`testing.md`)
- `PUBLIC_DATA_API_KEY` 미설정 시 조용히 skip + `CrawlJob(status="cancelled")` 기록 패턴 준수 (`crawler/service_public.py` 기존 관행)
- 네이버 크롤링과 무관한 API(data.go.kr)라 `AdaptiveThrottle` 경유는 불필요 — 단 curl_cffi 재시도·타임아웃은 기존 `PublicDataAPI` 패턴 준용

---

## Part A — DB 마이그레이션 + ORM 모델

### Task 1: V040 오피스텔 컬럼 마이그레이션 + ORM 확장

**Files:**
- Create: `backend/db/migrations/V040__presale_house_type.sql`
- Modify: `backend/db/mb_models.py:353-407` (PresaleScheduleOfficial·ApplyhomeUnitSupply에 컬럼 추가)
- Test: `backend/tests/test_mb_schema_sync.py`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `PresaleScheduleOfficial.house_type: Mapped[str]`(default `"apt"`), `ApplyhomeUnitSupply.house_type: Mapped[str]`(default `"apt"`) — Task 3(수집기)·Task 5(라우터)가 이 필드로 `"apt"` vs `"officetel"` 분기

- [ ] **Step 1: 마이그레이션 SQL 작성**

`backend/db/migrations/V040__presale_house_type.sql`:

```sql
-- V040: presale_schedule_official·applyhome_unit_supply 에 house_type 컬럼 추가
-- 오피스텔/도시형/생활숙박(getUrbtyOfctlLttotPblancDetail/Mdl)을 기존 아파트 청약
-- 테이블에 흡수. 필드 구성이 기존 아파트 API와 거의 동일(공고·일정·평형별 공급)이라
-- 새 테이블을 파지 않는다 (설계 §4-1, 이슈 #323).
ALTER TABLE presale_schedule_official
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN presale_schedule_official.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancDetail)';

ALTER TABLE applyhome_unit_supply
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN applyhome_unit_supply.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancMdl)';

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE presale_schedule_official DROP COLUMN IF EXISTS house_type;
-- ALTER TABLE applyhome_unit_supply DROP COLUMN IF EXISTS house_type;
```

- [ ] **Step 2: ORM 모델에 컬럼 추가**

`backend/db/mb_models.py`의 `PresaleScheduleOfficial` 클래스(라인 353~381) `fetched_at` 필드 다음에 추가:

```python
    house_type: Mapped[str] = mapped_column(Text, nullable=False, default="apt")
```

`ApplyhomeUnitSupply` 클래스(라인 387~406) `fetched_at` 필드 다음에 동일하게 추가:

```python
    house_type: Mapped[str] = mapped_column(Text, nullable=False, default="apt")
```

- [ ] **Step 3: schema sync 테스트에 신규 컬럼 반영**

`backend/tests/test_mb_schema_sync.py`를 Read해서 `PresaleScheduleOfficial`·`ApplyhomeUnitSupply`의 컬럼 목록을 검증하는 기존 테스트(있다면)에 `house_type`을 추가. 없으면 아래를 신규 추가:

```python
def test_presale_schedule_official_has_house_type_column():
    """V040 컬럼이 ORM에 매핑돼 있는지 — 마이그 누락 시 즉시 실패."""
    from db.mb_models import PresaleScheduleOfficial
    assert "house_type" in PresaleScheduleOfficial.__table__.columns


def test_applyhome_unit_supply_has_house_type_column():
    from db.mb_models import ApplyhomeUnitSupply
    assert "house_type" in ApplyhomeUnitSupply.__table__.columns
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && python -m pytest tests/test_mb_schema_sync.py -v`
Expected: PASS (SQLite 테스트 DB는 `db/database.py`가 매 실행 `Base.metadata.create_all()`로 재생성하므로 마이그레이션 SQL 없이도 ORM 컬럼 정의만으로 통과)

- [ ] **Step 5: 전체 회귀 확인**

Run: `cd backend && ruff check . && python -m pytest --tb=short -q`
Expected: 기존 테스트 전부 PASS (house_type default="apt"라 기존 쿼리·serializer 무영향)

- [ ] **Step 6: Commit**

```bash
git add backend/db/migrations/V040__presale_house_type.sql backend/db/mb_models.py backend/tests/test_mb_schema_sync.py
git commit -m "feat(mb): V040 오피스텔 house_type 컬럼 (기존 청약 테이블 확장)"
```

---

### Task 2: V041~V042 민간임대 신규 테이블 + ORM 모델

**Files:**
- Create: `backend/db/migrations/V041__rental_schedule_official.sql`
- Create: `backend/db/migrations/V042__rental_unit_supply.sql`
- Modify: `backend/db/mb_models.py` (RentalScheduleOfficial·RentalUnitSupply 신규 클래스 추가, 파일 끝)

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces: `RentalScheduleOfficial`(PK `house_manage_no`), `RentalUnitSupply`(FK `house_manage_no`) ORM 클래스 — Task 4(민간임대 수집기)·Task 6(라우터)이 사용

- [ ] **Step 1: V041 마이그레이션 작성**

`backend/db/migrations/V041__rental_schedule_official.sql`:

```sql
-- V041: 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail).
-- apartments 테이블과 독립 — 임대주택은 우리 아파트/오피스텔 로스터에 없는
-- 별도 매물이라 apartment_id 매칭 대상이 없다 (설계 §4-2, 이슈 #323).
CREATE TABLE IF NOT EXISTS rental_schedule_official (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL,
  pblanc_no TEXT,
  house_nm TEXT NOT NULL,
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
  region_code TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no)
);
CREATE INDEX IF NOT EXISTS idx_rental_schedule_region ON rental_schedule_official(region_code);
COMMENT ON TABLE rental_schedule_official IS
  '청약홈 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail). apartments 테이블과 독립.';
ALTER TABLE rental_schedule_official ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON rental_schedule_official FOR SELECT USING (true);
CREATE POLICY "Service write" ON rental_schedule_official FOR ALL USING (auth.role() = 'service_role');
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS rental_schedule_official;
```

- [ ] **Step 2: V042 마이그레이션 작성**

`backend/db/migrations/V042__rental_unit_supply.sql`:

```sql
-- V042: 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).
CREATE TABLE IF NOT EXISTS rental_unit_supply (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL REFERENCES rental_schedule_official(house_manage_no) ON DELETE CASCADE,
  model_no TEXT NOT NULL,
  house_ty TEXT,
  supply_area FLOAT,
  exclusive_area FLOAT,
  contract_area FLOAT,
  general_supply INTEGER,
  youth_supply INTEGER,
  newlywed_supply INTEGER,
  elderly_supply INTEGER,
  monthly_rent INTEGER,
  deposit INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no, model_no)
);
COMMENT ON TABLE rental_unit_supply IS
  '청약홈 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).';
ALTER TABLE rental_unit_supply ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON rental_unit_supply FOR SELECT USING (true);
CREATE POLICY "Service write" ON rental_unit_supply FOR ALL USING (auth.role() = 'service_role');
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS rental_unit_supply;
```

- [ ] **Step 3: ORM 모델 추가**

`backend/db/mb_models.py` 파일 끝(`ApplyhomeUnitSupply` 클래스 다음)에 추가:

```python
# ── 청약홈 공공지원 민간임대 (naver-estate-web 자체 수집, apartments 독립) ──


class RentalScheduleOfficial(Base):
    """청약홈 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail).

    apartments 테이블과 독립 — 임대주택은 우리 로스터에 없는 별도 매물.
    UNIQUE(house_manage_no): 공고 단위 유일.
    """

    __tablename__ = "rental_schedule_official"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    pblanc_no: Mapped[str | None] = mapped_column(Text)
    house_nm: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    recruit_date: Mapped[date | None] = mapped_column(Date)
    receipt_bgnde: Mapped[date | None] = mapped_column(Date)
    receipt_endde: Mapped[date | None] = mapped_column(Date)
    winner_announce_date: Mapped[date | None] = mapped_column(Date)
    contract_bgnde: Mapped[date | None] = mapped_column(Date)
    contract_endde: Mapped[date | None] = mapped_column(Date)
    move_in_ym: Mapped[str | None] = mapped_column(Text)
    tot_supply: Mapped[int | None] = mapped_column(Integer)
    pblanc_url: Mapped[str | None] = mapped_column(Text)
    biz_entity: Mapped[str | None] = mapped_column(Text)
    constructor: Mapped[str | None] = mapped_column(Text)
    region_code: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)


class RentalUnitSupply(Base):
    """청약홈 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).

    house_manage_no 로 RentalScheduleOfficial 과 N:1.
    """

    __tablename__ = "rental_unit_supply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    house_manage_no: Mapped[str] = mapped_column(Text, nullable=False)
    model_no: Mapped[str] = mapped_column(Text, nullable=False)
    house_ty: Mapped[str | None] = mapped_column(Text)
    supply_area: Mapped[float | None] = mapped_column(Float)
    exclusive_area: Mapped[float | None] = mapped_column(Float)
    contract_area: Mapped[float | None] = mapped_column(Float)
    general_supply: Mapped[int | None] = mapped_column(Integer)
    youth_supply: Mapped[int | None] = mapped_column(Integer)
    newlywed_supply: Mapped[int | None] = mapped_column(Integer)
    elderly_supply: Mapped[int | None] = mapped_column(Integer)
    monthly_rent: Mapped[int | None] = mapped_column(Integer)
    deposit: Mapped[int | None] = mapped_column(Integer)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
```

- [ ] **Step 4: 신규 테이블 존재 확인 테스트**

`backend/tests/test_mb_schema_sync.py`에 추가:

```python
def test_rental_schedule_official_model_maps_expected_columns():
    from db.mb_models import RentalScheduleOfficial
    cols = set(RentalScheduleOfficial.__table__.columns.keys())
    assert {"house_manage_no", "house_nm", "recruit_date", "region_code"} <= cols


def test_rental_unit_supply_model_maps_expected_columns():
    from db.mb_models import RentalUnitSupply
    cols = set(RentalUnitSupply.__table__.columns.keys())
    assert {"house_manage_no", "model_no", "monthly_rent", "deposit"} <= cols
```

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && python -m pytest tests/test_mb_schema_sync.py -v`
Expected: PASS (SQLite 테스트 DB가 `create_all()`로 신규 테이블 자동 생성)

- [ ] **Step 6: Commit**

```bash
git add backend/db/migrations/V041__rental_schedule_official.sql backend/db/migrations/V042__rental_unit_supply.sql backend/db/mb_models.py backend/tests/test_mb_schema_sync.py
git commit -m "feat(mb): V041~V042 민간임대 신규 테이블 + ORM 모델"
```

---

## Part B — 수집기 (backend/crawler)

### Task 3: 오피스텔 API 클라이언트 + 파서 유틸

**Files:**
- Create: `backend/crawler/applyhome_officetel_api.py`
- Test: `backend/tests/test_applyhome_officetel_api.py`

**Interfaces:**
- Consumes: `os.getenv("PUBLIC_DATA_API_KEY")` (기존 `.env` 값, 이미 확인된 승인 키)
- Produces: `fetch_officetel_detail(page, per_page) -> dict`, `fetch_officetel_unit(page, per_page) -> dict`, `fetch_rental_detail(page, per_page) -> dict`, `fetch_rental_unit(page, per_page) -> dict` (4개 함수, 각각 odcloud.kr 응답 JSON 그대로 반환), `parse_compact_date(v: str | None) -> date | None`(mibunyang §3-2 `toDateFlexible` 이식 — ISO/compact 두 형식), `parse_comma_amount(v) -> int | None`(mibunyang §3-3 콤마 제거 이식) — Task 4·5가 이 함수들을 그대로 소비

- [ ] **Step 1: API 클라이언트 실패 테스트 작성**

`backend/tests/test_applyhome_officetel_api.py`:

```python
"""청약홈 오피스텔·민간임대 API 클라이언트 + 파서 회귀 가드 (이슈 #323)."""
from datetime import date

from crawler.applyhome_officetel_api import parse_comma_amount, parse_compact_date


def test_parse_compact_date_iso_format():
    """기존 아파트 API 형식(ISO, 2026-08-06)을 그대로 통과."""
    assert parse_compact_date("2026-08-06") == date(2026, 8, 6)


def test_parse_compact_date_compact_format():
    """오피스텔 API 특유 형식(YYYYMMDD, 20260804) 을 ISO 로 변환.

    mibunyang 실측(§3-2): getOPTLttotPblancDetail 계열이 compact 형식을 준다 —
    같은 odcloud.kr 시스템이라 오피스텔 API도 동일 함정일 수 있어 방어.
    """
    assert parse_compact_date("20260804") == date(2026, 8, 4)


def test_parse_compact_date_invalid_returns_none():
    assert parse_compact_date("미정") is None
    assert parse_compact_date(None) is None
    assert parse_compact_date("") is None


def test_parse_comma_amount_with_comma():
    """콤마 낀 금액 형식(mibunyang §3-3 getOPTLttotPblancMdl 실측 패턴)."""
    assert parse_comma_amount("62,342") == 62342


def test_parse_comma_amount_without_comma():
    assert parse_comma_amount("134190") == 134190


def test_parse_comma_amount_invalid_returns_none():
    assert parse_comma_amount("-") is None
    assert parse_comma_amount(None) is None
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd backend && python -m pytest tests/test_applyhome_officetel_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'crawler.applyhome_officetel_api'`

- [ ] **Step 3: 클라이언트·파서 구현**

`backend/crawler/applyhome_officetel_api.py`:

```python
"""청약홈 오피스텔·도시형·공공지원 민간임대 API 클라이언트 (이슈 #323).

data.go.kr 카탈로그 15098547 (한국부동산원_청약홈 분양정보 조회 서비스) —
기존 PUBLIC_DATA_API_KEY 로 이미 승인된 서비스 안에 오피스텔·민간임대
오퍼레이션이 함께 포함돼 있다 (2026-08-08 실측, 승인 완료).

API 문서: https://www.data.go.kr/data/15098547/openapi.do
"""

import logging
import os
from datetime import date, datetime

from curl_cffi import requests as cffi_requests

logger = logging.getLogger(__name__)

BASE_URL = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1"
REQUEST_TIMEOUT = 15
MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]


def _get_api_key() -> str | None:
    return os.getenv("PUBLIC_DATA_API_KEY")


def _call(op: str, page: int, per_page: int) -> dict:
    """odcloud.kr 오퍼레이션 1페이지 호출 (재시도 내장)."""
    api_key = _get_api_key()
    session = cffi_requests.Session()
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            r = session.get(
                f"{BASE_URL}/{op}",
                params={
                    "serviceKey": api_key,
                    "page": page,
                    "perPage": per_page,
                    "returnType": "JSON",
                },
                timeout=REQUEST_TIMEOUT,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001 — 외부 API 예외 유형 다양, 재시도 목적
            last_exc = e
            if attempt < MAX_RETRIES - 1:
                import time

                time.sleep(RETRY_DELAYS[attempt])
    raise RuntimeError(f"{op} 호출 실패 ({MAX_RETRIES}회 재시도)") from last_exc


def fetch_officetel_detail(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 공고 상세 (getUrbtyOfctlLttotPblancDetail)."""
    return _call("getUrbtyOfctlLttotPblancDetail", page, per_page)


def fetch_officetel_unit(page: int = 1, per_page: int = 1000) -> dict:
    """오피스텔/도시형/생숙 평형별 공급정보 (getUrbtyOfctlLttotPblancMdl)."""
    return _call("getUrbtyOfctlLttotPblancMdl", page, per_page)


def fetch_rental_detail(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 공고 상세 (getPblPvtRentLttotPblancDetail)."""
    return _call("getPblPvtRentLttotPblancDetail", page, per_page)


def fetch_rental_unit(page: int = 1, per_page: int = 1000) -> dict:
    """공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl)."""
    return _call("getPblPvtRentLttotPblancMdl", page, per_page)


def parse_compact_date(v: str | None) -> date | None:
    """ISO("2026-08-06")·compact("20260804") 두 형식 모두 date 로. 그 외 None.

    mibunyang 실측(설계문서 §4-3 인용, 원 출처 applyhome-competition-8ch-design.md §3-2):
    같은 odcloud.kr 시스템 안에서도 오퍼레이션마다 날짜 형식이 다르다.
    """
    if not isinstance(v, str):
        return None
    t = v.strip()
    if not t:
        return None
    try:
        if len(t) == 10 and t[4] == "-" and t[7] == "-":
            return datetime.strptime(t, "%Y-%m-%d").date()
        if len(t) == 8 and t.isdigit():
            return datetime.strptime(t, "%Y%m%d").date()
    except ValueError:
        return None
    return None


def parse_comma_amount(v) -> int | None:
    """콤마 유무 상관없이 금액 문자열을 int 로. "-"·None·빈문자열은 None.

    mibunyang 실측: getOPTLttotPblancMdl 은 "62,342"(콤마 있음),
    getRemndrLttotPblancMdl 은 "134190"(콤마 없음) — 같은 필드가 오퍼레이션마다 다르다.
    """
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s == "-":
        return None
    try:
        return int(float(s))
    except ValueError:
        return None
```

- [ ] **Step 4: 테스트 재실행 (통과 확인)**

Run: `cd backend && python -m pytest tests/test_applyhome_officetel_api.py -v`
Expected: PASS (6개 전부)

- [ ] **Step 5: lint 확인**

Run: `cd backend && ruff check crawler/applyhome_officetel_api.py tests/test_applyhome_officetel_api.py`
Expected: no issues

- [ ] **Step 6: Commit**

```bash
git add backend/crawler/applyhome_officetel_api.py backend/tests/test_applyhome_officetel_api.py
git commit -m "feat(mb): 청약홈 오피스텔·민간임대 API 클라이언트 + 값 형태 파서"
```

---

### Task 4: 오피스텔 수집 잡 (기존 테이블 upsert)

**Files:**
- Create: `backend/crawler/service_applyhome_officetel.py`
- Test: `backend/tests/test_service_applyhome_officetel.py`

**Interfaces:**
- Consumes: `crawler.applyhome_officetel_api.fetch_officetel_detail/fetch_officetel_unit`, `parse_compact_date`, `parse_comma_amount` (Task 3), `db.mb_models.PresaleScheduleOfficial/ApplyhomeUnitSupply/Apartment` (Task 1), `services.upsert._do_upsert`(기존 dialect-aware upsert 헬퍼)
- Produces: `collect_officetel_presale(batch_size: int = 1000, scheduler_job_id: str | None = None) -> None` — Task 7(스케줄러 등록)이 이 함수를 add_job으로 등록

- [ ] **Step 1: 매칭 로직 실패 테스트 작성**

`backend/tests/test_service_applyhome_officetel.py`:

```python
"""오피스텔 청약 수집 잡 회귀 가드 (이슈 #323).

핵심 검증: house_manage_no 매칭 대상 단지가 apartments 에 없으면 skip(에러 아님),
PUBLIC_DATA_API_KEY 미설정 시 조용히 cancelled 기록 (기존 collect_public_trade_data 패턴).
"""
import os
from unittest.mock import patch

from db.mb_models import Apartment
from db.models import CrawlJob


def test_collect_officetel_presale_skips_when_key_missing(db):
    """API 키 미설정 시 API 호출 없이 cancelled job 기록."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("PUBLIC_DATA_API_KEY", None)
        collect_officetel_presale(scheduler_job_id="test_officetel")

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job is not None
    assert job.status == "cancelled"


def test_collect_officetel_presale_upserts_matched_apartment(db):
    """API 응답의 house_manage_no 가 이미 apartments 에 등록돼 있으면 upsert."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    apt = Apartment(id="ah-2026000999", name="테스트오피스텔", region="서울")
    db.add(apt)
    db.commit()

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026000999",
                "PBLANC_NO": "2026000999",
                "HOUSE_NM": "테스트오피스텔",
                "RCRIT_PBLANC_DE": "2026-08-06",
                "TOT_SUPLY_HSHLDCO": 50,
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            return_value=fake_unit,
        ),
    ):
        collect_officetel_presale(scheduler_job_id="test_officetel")

    from db.mb_models import PresaleScheduleOfficial

    row = (
        db.query(PresaleScheduleOfficial)
        .filter(PresaleScheduleOfficial.house_manage_no == "2026000999")
        .first()
    )
    assert row is not None
    assert row.house_type == "officetel"
    assert row.apartment_id == "ah-2026000999"


def test_collect_officetel_presale_skips_unmatched_apartment(db):
    """apartments 에 없는 house_manage_no 는 저장하지 않고 넘어간다 (에러 아님)."""
    from crawler.service_applyhome_officetel import collect_officetel_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026999999",
                "HOUSE_NM": "미등록오피스텔",
                "RCRIT_PBLANC_DE": "2026-08-06",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_officetel.fetch_officetel_unit",
            return_value=fake_unit,
        ),
    ):
        collect_officetel_presale(scheduler_job_id="test_officetel")

    from db.mb_models import PresaleScheduleOfficial

    row = (
        db.query(PresaleScheduleOfficial)
        .filter(PresaleScheduleOfficial.house_manage_no == "2026999999")
        .first()
    )
    assert row is None

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "officetel_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "completed"
```

> **fixture 확인 완료** (`backend/tests/conftest.py` 실측): DB 세션 fixture명은 `db`(라인 127~133, `TestSession()` 반환), HTTP 클라이언트는 `client`(라인 136~151, `db` fixture에 의존). 위 테스트가 쓰는 이름 그대로 정답이다 — 추가 확인 불필요.

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd backend && python -m pytest tests/test_service_applyhome_officetel.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: 수집 잡 구현**

`backend/crawler/service_applyhome_officetel.py`:

```python
"""오피스텔·도시형 청약 수집 잡 (이슈 #323).

기존 아파트 청약(mibunyang collect-applyhome-detail.mjs)과 별개로
naver-estate-web 이 자체 수집. apartments 로스터에 이미 있는 단지(house_manage_no
가 ah-{HOUSE_MANAGE_NO} 형태로 등록된 것)만 매칭해 presale_schedule_official·
applyhome_unit_supply 에 house_type='officetel' 로 upsert.

주1회(월요일) 스케줄러 잡. crawler/service_public.py 의 job 기록·에러 처리
패턴(CrawlJob cancelled/completed/failed)을 그대로 따른다.
"""

import logging
import os

from crawler.applyhome_officetel_api import (
    fetch_officetel_detail,
    fetch_officetel_unit,
    parse_compact_date,
    parse_comma_amount,
)
from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.mb_models import Apartment, ApplyhomeUnitSupply, PresaleScheduleOfficial
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_officetel_presale(batch_size: int = 1000, scheduler_job_id: str | None = None):
    """오피스텔/도시형 청약 공고 + 평형별 공급정보 수집 → 기존 청약 테이블 upsert."""
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 오피스텔 청약 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    db = SessionLocal()
    job = CrawlJob(
        job_type="officetel_presale", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id

    try:
        # apartments 로스터에서 오피스텔 house_manage_no → apartment_id 매핑 구축.
        # mibunyang 관행(ah-{HOUSE_MANAGE_NO} 형태 ID)을 그대로 따른다.
        apt_rows = db.query(Apartment.id).all()
        known_ids = {r.id for r in apt_rows}

        detail_resp = fetch_officetel_detail(page=1, per_page=batch_size)
        detail_rows = detail_resp.get("data", [])

        matched = 0
        for row in detail_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            if not hmn:
                continue
            apartment_id = f"ah-{hmn}"
            if apartment_id not in known_ids:
                continue  # 로스터에 없는 오피스텔은 skip (매칭 커버리지 낮음, 설계 §4-2 인용 원칙)

            existing = (
                db.query(PresaleScheduleOfficial)
                .filter(
                    PresaleScheduleOfficial.apartment_id == apartment_id,
                    PresaleScheduleOfficial.house_manage_no == hmn,
                )
                .first()
            )
            recruit_date = parse_compact_date(row.get("RCRIT_PBLANC_DE"))
            if existing:
                existing.house_type = "officetel"
                existing.recruit_date = recruit_date
                existing.tot_supply = row.get("TOT_SUPLY_HSHLDCO")
                existing.pblanc_url = row.get("PBLANC_URL")
                existing.biz_entity = row.get("BSNS_MBY_NM")
                existing.constructor = row.get("CNSTRCT_ENTRPS_NM")
                existing.fetched_at = utcnow()
            else:
                db.add(
                    PresaleScheduleOfficial(
                        apartment_id=apartment_id,
                        house_manage_no=hmn,
                        pblanc_no=row.get("PBLANC_NO"),
                        recruit_date=recruit_date,
                        tot_supply=row.get("TOT_SUPLY_HSHLDCO"),
                        pblanc_url=row.get("PBLANC_URL"),
                        biz_entity=row.get("BSNS_MBY_NM"),
                        constructor=row.get("CNSTRCT_ENTRPS_NM"),
                        house_type="officetel",
                        fetched_at=utcnow(),
                    )
                )
            matched += 1
        db.commit()

        unit_resp = fetch_officetel_unit(page=1, per_page=batch_size)
        unit_rows = unit_resp.get("data", [])
        unit_matched = 0
        for row in unit_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            model_no = row.get("MODEL_NO")
            if not hmn or not model_no:
                continue
            apartment_id = f"ah-{hmn}"
            if apartment_id not in known_ids:
                continue

            existing_unit = (
                db.query(ApplyhomeUnitSupply)
                .filter(
                    ApplyhomeUnitSupply.apartment_id == apartment_id,
                    ApplyhomeUnitSupply.house_manage_no == hmn,
                    ApplyhomeUnitSupply.model_no == model_no,
                )
                .first()
            )
            top_amount = parse_comma_amount(row.get("LTTOT_TOP_AMOUNT"))
            if existing_unit:
                existing_unit.house_type = "officetel"
                existing_unit.top_amount = top_amount
                existing_unit.fetched_at = utcnow()
            else:
                db.add(
                    ApplyhomeUnitSupply(
                        apartment_id=apartment_id,
                        house_manage_no=hmn,
                        model_no=model_no,
                        house_ty=row.get("HOUSE_TY"),
                        top_amount=top_amount,
                        house_type="officetel",
                        fetched_at=utcnow(),
                    )
                )
            unit_matched += 1
        db.commit()

        job.status = "completed"
        job.total_items = len(detail_rows) + len(unit_rows)
        job.processed_items = matched + unit_matched
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "오피스텔 청약 수집 완료: 공고 %d/%d 매칭, 평형 %d/%d 매칭",
            matched, len(detail_rows), unit_matched, len(unit_rows),
        )
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("오피스텔 청약 수집 실패")
    finally:
        db.close()
```

- [ ] **Step 4: 테스트 재실행 (통과 확인)**

Run: `cd backend && python -m pytest tests/test_service_applyhome_officetel.py -v`
Expected: PASS (3개 전부)

- [ ] **Step 5: 전체 회귀 확인**

Run: `cd backend && ruff check . && python -m pytest --tb=short -q`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/crawler/service_applyhome_officetel.py backend/tests/test_service_applyhome_officetel.py
git commit -m "feat(mb): 오피스텔 청약 수집 잡 (기존 apartments 로스터 매칭)"
```

---

### Task 5: 민간임대 수집 잡 (신규 테이블 upsert)

**Files:**
- Create: `backend/crawler/service_applyhome_rental.py`
- Test: `backend/tests/test_service_applyhome_rental.py`

**Interfaces:**
- Consumes: `crawler.applyhome_officetel_api.fetch_rental_detail/fetch_rental_unit`, `parse_compact_date`, `parse_comma_amount` (Task 3), `db.mb_models.RentalScheduleOfficial/RentalUnitSupply` (Task 2)
- Produces: `collect_rental_presale(batch_size: int = 1000, scheduler_job_id: str | None = None) -> None` — Task 7이 등록

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_service_applyhome_rental.py`:

```python
"""민간임대 청약 수집 잡 회귀 가드 (이슈 #323).

오피스텔과 달리 apartments 매칭이 없다 — house_manage_no 자체가 PK라
전량 upsert (skip 로직 없음, 설계 §4-2: '로스터에 없는 별도 매물').
"""
import os
from unittest.mock import patch

from db.models import CrawlJob


def test_collect_rental_presale_skips_when_key_missing(db):
    from crawler.service_applyhome_rental import collect_rental_presale

    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("PUBLIC_DATA_API_KEY", None)
        collect_rental_presale(scheduler_job_id="test_rental")

    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "rental_presale")
        .order_by(CrawlJob.id.desc())
        .first()
    )
    assert job.status == "cancelled"


def test_collect_rental_presale_inserts_new_listing(db):
    """apartments 매칭 없이 house_manage_no 로 바로 upsert."""
    from crawler.service_applyhome_rental import collect_rental_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026800001",
                "HOUSE_NM": "테스트행복주택",
                "HSSPLY_ADRES": "서울 강남구",
                "RCRIT_PBLANC_DE": "2026-08-06",
                "TOT_SUPLY_HSHLDCO": 30,
                "SUBSCRPT_AREA_CODE": "100",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_unit",
            return_value=fake_unit,
        ),
    ):
        collect_rental_presale(scheduler_job_id="test_rental")

    from db.mb_models import RentalScheduleOfficial

    row = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026800001")
        .first()
    )
    assert row is not None
    assert row.house_nm == "테스트행복주택"
    assert row.region_code == "100"


def test_collect_rental_presale_updates_existing_listing(db):
    """이미 있는 house_manage_no 는 갱신(upsert), 중복행 생성 안 함."""
    from db.mb_models import RentalScheduleOfficial
    from utils import utcnow

    db.add(
        RentalScheduleOfficial(
            house_manage_no="2026800002",
            house_nm="옛이름",
            fetched_at=utcnow(),
        )
    )
    db.commit()

    from crawler.service_applyhome_rental import collect_rental_presale

    fake_detail = {
        "data": [
            {
                "HOUSE_MANAGE_NO": "2026800002",
                "HOUSE_NM": "새이름",
                "RCRIT_PBLANC_DE": "2026-08-07",
            }
        ],
        "totalCount": 1,
    }
    fake_unit = {"data": [], "totalCount": 0}

    with (
        patch.dict(os.environ, {"PUBLIC_DATA_API_KEY": "fake-key-for-test"}),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_detail",
            return_value=fake_detail,
        ),
        patch(
            "crawler.service_applyhome_rental.fetch_rental_unit",
            return_value=fake_unit,
        ),
    ):
        collect_rental_presale(scheduler_job_id="test_rental")

    rows = (
        db.query(RentalScheduleOfficial)
        .filter(RentalScheduleOfficial.house_manage_no == "2026800002")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].house_nm == "새이름"
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd backend && python -m pytest tests/test_service_applyhome_rental.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: 수집 잡 구현**

`backend/crawler/service_applyhome_rental.py`:

```python
"""공공지원 민간임대 청약 수집 잡 (이슈 #323).

apartments 로스터와 무관한 독립 매물 — house_manage_no 를 PK 삼아 전량 upsert.
주1회(월요일) 스케줄러 잡.
"""

import logging
import os

from crawler.applyhome_officetel_api import (
    fetch_rental_detail,
    fetch_rental_unit,
    parse_compact_date,
    parse_comma_amount,
)
from crawler.service_common import fail_job_safely
from db.database import SessionLocal
from db.mb_models import RentalScheduleOfficial, RentalUnitSupply
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def collect_rental_presale(batch_size: int = 1000, scheduler_job_id: str | None = None):
    """공공지원 민간임대 공고 + 평형별 공급정보 수집 → rental_* 테이블 upsert."""
    api_key = os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.info("PUBLIC_DATA_API_KEY 미설정 — 민간임대 청약 수집 건너뜀")
        if scheduler_job_id:
            db = SessionLocal()
            job = CrawlJob(
                job_type="rental_presale", scheduler_job_id=scheduler_job_id,
                status="cancelled", started_at=utcnow(), completed_at=utcnow(),
                error_message="PUBLIC_DATA_API_KEY 미설정",
            )
            db.add(job)
            db.commit()
            db.close()
        return

    db = SessionLocal()
    job = CrawlJob(
        job_type="rental_presale", scheduler_job_id=scheduler_job_id,
        status="running", started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id

    try:
        detail_resp = fetch_rental_detail(page=1, per_page=batch_size)
        detail_rows = detail_resp.get("data", [])

        upserted = 0
        for row in detail_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            house_nm = row.get("HOUSE_NM")
            if not hmn or not house_nm:
                continue

            existing = (
                db.query(RentalScheduleOfficial)
                .filter(RentalScheduleOfficial.house_manage_no == hmn)
                .first()
            )
            recruit_date = parse_compact_date(row.get("RCRIT_PBLANC_DE"))
            if existing:
                existing.house_nm = house_nm
                existing.address = row.get("HSSPLY_ADRES")
                existing.recruit_date = recruit_date
                existing.tot_supply = row.get("TOT_SUPLY_HSHLDCO")
                existing.pblanc_url = row.get("PBLANC_URL")
                existing.biz_entity = row.get("BSNS_MBY_NM")
                existing.constructor = row.get("CNSTRCT_ENTRPS_NM")
                existing.region_code = row.get("SUBSCRPT_AREA_CODE")
                existing.fetched_at = utcnow()
            else:
                db.add(
                    RentalScheduleOfficial(
                        house_manage_no=hmn,
                        pblanc_no=row.get("PBLANC_NO"),
                        house_nm=house_nm,
                        address=row.get("HSSPLY_ADRES"),
                        recruit_date=recruit_date,
                        tot_supply=row.get("TOT_SUPLY_HSHLDCO"),
                        pblanc_url=row.get("PBLANC_URL"),
                        biz_entity=row.get("BSNS_MBY_NM"),
                        constructor=row.get("CNSTRCT_ENTRPS_NM"),
                        region_code=row.get("SUBSCRPT_AREA_CODE"),
                        fetched_at=utcnow(),
                    )
                )
            upserted += 1
        db.commit()

        unit_resp = fetch_rental_unit(page=1, per_page=batch_size)
        unit_rows = unit_resp.get("data", [])
        unit_upserted = 0
        for row in unit_rows:
            hmn = row.get("HOUSE_MANAGE_NO")
            model_no = row.get("MODEL_NO")
            if not hmn or not model_no:
                continue

            existing_unit = (
                db.query(RentalUnitSupply)
                .filter(
                    RentalUnitSupply.house_manage_no == hmn,
                    RentalUnitSupply.model_no == model_no,
                )
                .first()
            )
            fields = {
                "house_ty": row.get("HOUSE_TY"),
                "supply_area": row.get("SUPLY_AR"),
                "exclusive_area": row.get("EXCLU_AR"),
                "contract_area": row.get("CNTRCT_AR"),
                "general_supply": row.get("GNRL_HSHLDCO"),
                "youth_supply": row.get("YGMN_HSHLDCO"),
                "newlywed_supply": row.get("NWWDS_HSHLDCO"),
                "elderly_supply": row.get("OLD_PARNTS_SUPORT_HSHLDCO"),
                "monthly_rent": parse_comma_amount(row.get("MTH_RENT_AMOUNT")),
                "deposit": parse_comma_amount(row.get("DEPOSIT_AMOUNT")),
            }
            if existing_unit:
                for k, v in fields.items():
                    setattr(existing_unit, k, v)
                existing_unit.fetched_at = utcnow()
            else:
                db.add(
                    RentalUnitSupply(
                        house_manage_no=hmn, model_no=model_no,
                        fetched_at=utcnow(), **fields,
                    )
                )
            unit_upserted += 1
        db.commit()

        job.status = "completed"
        job.total_items = len(detail_rows) + len(unit_rows)
        job.processed_items = upserted + unit_upserted
        job.completed_at = utcnow()
        db.commit()
        logger.info(
            "민간임대 청약 수집 완료: 공고 %d건, 평형 %d건", upserted, unit_upserted
        )
    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            fail_job_safely(job_id, str(e)[:500])
        logger.exception("민간임대 청약 수집 실패")
    finally:
        db.close()
```

> **주의**: `MTH_RENT_AMOUNT`·`DEPOSIT_AMOUNT`·`EXCLU_AR`·`CNTRCT_AR`·`GNRL_HSHLDCO` 등 민간임대 평형 API 필드명은 이번 조사에서 실제 응답을 UTF-8로 확보하지 못해 **추정값**이다. Task 5 실행 전 반드시 `fetch_rental_unit()`을 1회 실호출(UTF-8 강제, 예: `PYTHONIOENCODING=utf-8`)해 실제 필드명과 대조하고 다른 점이 있으면 코드를 수정한다 — 이건 이 태스크의 Step 3.5로 별도 검증 단계를 추가한다.

- [ ] **Step 3.5: 실제 API 응답으로 필드명 검증 (구현 전 필수)**

Run:
```bash
cd backend && PYTHONIOENCODING=utf-8 python -c "
from crawler.applyhome_officetel_api import fetch_rental_unit
import json
resp = fetch_rental_unit(page=1, per_page=1)
print(json.dumps(resp.get('data', [{}])[0], ensure_ascii=False, indent=2))
"
```
Expected: 실제 필드명 목록 출력. Step 3의 `fields` 딕셔너리 키(`MTH_RENT_AMOUNT` 등)가 이 출력과 다르면 Step 3 코드를 실제 필드명으로 정정한다.

- [ ] **Step 4: 테스트 재실행 (통과 확인)**

Run: `cd backend && python -m pytest tests/test_service_applyhome_rental.py -v`
Expected: PASS (3개 전부)

- [ ] **Step 5: 전체 회귀 확인**

Run: `cd backend && ruff check . && python -m pytest --tb=short -q`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/crawler/service_applyhome_rental.py backend/tests/test_service_applyhome_rental.py
git commit -m "feat(mb): 민간임대 청약 수집 잡 (신규 독립 테이블 upsert)"
```

---

### Task 6: 스케줄러 등록 (주1회 월요일)

**Files:**
- Modify: `backend/crawler/scheduler.py` (신규 잡 2개 add_job)
- Modify: `.claude/rules/infra.md` (스케줄러 표에 신규 잡 2행 추가)

**Interfaces:**
- Consumes: `crawler.service_applyhome_officetel.collect_officetel_presale` (Task 4), `crawler.service_applyhome_rental.collect_rental_presale` (Task 5)
- Produces: 없음 (터미널 태스크 — 스케줄러 등록으로 파이프라인 완성)

- [ ] **Step 1: 기존 mibunyang cron 충돌 여부 확인**

`backend/crawler/scheduler.py`를 Grep해서 `day_of_week="mon"` 또는 월요일 트리거가 이미 있는지, `PUBLIC_DATA_ENABLED` 토글 변수가 있는지 확인. 기존 공공데이터 실거래가 잡(토요일 5시)과 시간 안 겹치게, 월요일 05:00으로 배치.

- [ ] **Step 2: 스케줄러에 신규 잡 2개 등록**

`backend/crawler/scheduler.py`의 `if PUBLIC_DATA_ENABLED:` 블록(라인 234 근처) 다음에 추가:

```python
    # G. 청약홈 오피스텔·민간임대 수집 — 주 1회 월요일 새벽 5시 (이슈 #323)
    #    공공데이터 실거래가(토요일 5시)와 겹치지 않게 요일 분리.
    if PUBLIC_DATA_ENABLED:
        from crawler.service_applyhome_officetel import collect_officetel_presale
        from crawler.service_applyhome_rental import collect_rental_presale

        scheduler.add_job(
            collect_officetel_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=0,
            kwargs={"scheduler_job_id": "officetel_presale"},
        )
        scheduler.add_job(
            collect_rental_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=30,
            kwargs={"scheduler_job_id": "rental_presale"},
        )
```

- [ ] **Step 3: infra.md 스케줄러 표 갱신**

`.claude/rules/infra.md`의 스케줄러 표(§스케줄러 APScheduler)에 2행 추가:

```
| 청약홈 오피스텔 수집 | 월요일 05:00 | 오피스텔/도시형 청약 공고+평형(getUrbtyOfctlLttotPblancDetail/Mdl), apartments 로스터 매칭분만 upsert (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 청약홈 민간임대 수집 | 월요일 05:30 | 공공지원 민간임대 공고+평형(getPblPvtRentLttotPblancDetail/Mdl), 신규 독립 테이블 (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
```

- [ ] **Step 4: 스케줄러 등록 자체를 검증하는 테스트**

`backend/tests/test_scheduler.py`(있으면)를 Grep해서 기존 잡 등록 검증 패턴을 확인. 있으면 동일 패턴으로 신규 잡 2개도 등록되는지 단언 추가. 없으면 스킵 가능(스케줄러 초기화 자체는 기존 통합 테스트가 이미 커버할 가능성 높음 — Grep 결과로 판단).

- [ ] **Step 5: 회귀 확인**

Run: `cd backend && ruff check . && python -m pytest --tb=short -q`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/crawler/scheduler.py .claude/rules/infra.md
git commit -m "feat(mb): 오피스텔·민간임대 청약 수집 스케줄러 등록 (월 05:00/05:30)"
```

> **release.md 트리거**: 이 태스크는 `crawler/scheduler.py` 변경이라 머지 후 release.md §2 4중 cross-check(zombie 확인) 의무.

---

## Part C — 백엔드 라우터·serializer

### Task 7: 오피스텔·민간임대 라우터 + serializer

**Files:**
- Modify: `backend/routers/mb_serializers.py` (rental_schedule_to_dict, rental_unit_supply_to_dict 추가)
- Modify: `backend/routers/mb.py` (`/presale/officetel-rental` 신규 엔드포인트)
- Test: `backend/tests/test_mb_officetel_rental_api.py`

**Interfaces:**
- Consumes: `db.mb_models.RentalScheduleOfficial/RentalUnitSupply` (Task 2), `db.mb_models.PresaleScheduleOfficial/ApplyhomeUnitSupply` (Task 1, `house_type='officetel'` 필터)
- Produces: `GET /api/mb/presale/officetel-rental` — FE Task 8이 `getMbOfficetelRental()` 함수로 호출

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_mb_officetel_rental_api.py`:

```python
"""오피스텔·민간임대 청약 API 회귀 가드 (이슈 #323)."""
from fastapi.testclient import TestClient

from db.mb_models import (
    Apartment,
    ApplyhomeUnitSupply,
    PresaleScheduleOfficial,
    RentalScheduleOfficial,
)


def test_get_officetel_rental_returns_both_kinds(client: TestClient, db):
    """오피스텔(apartments 연결) + 민간임대(독립) 를 한 목록에 합쳐 반환, 각 kind 필드로 구분."""
    apt = Apartment(id="ah-9990001", name="오피스텔A", region="서울")
    db.add(apt)
    db.add(
        PresaleScheduleOfficial(
            apartment_id="ah-9990001",
            house_manage_no="9990001",
            house_type="officetel",
            recruit_date="2026-08-01",
        )
    )
    db.add(
        RentalScheduleOfficial(
            house_manage_no="9990002",
            house_nm="임대B",
            recruit_date="2026-08-02",
        )
    )
    db.commit()

    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    data = resp.json()
    kinds = {item["kind"] for item in data["items"]}
    assert kinds == {"officetel", "rental"}
    assert data["total"] == 2


def test_get_officetel_rental_empty_when_no_data(client: TestClient, db):
    """데이터 0건이어도 200 + 빈 배열 (에러 아님, error-propagation.md 반례 아님 — 정상 빈 상태)."""
    resp = client.get("/api/mb/presale/officetel-rental")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0
```

> `client`·`db` fixture는 conftest.py 실측 완료(Task 4 참조) — 그대로 사용.

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd backend && python -m pytest tests/test_mb_officetel_rental_api.py -v`
Expected: FAIL with 404 (엔드포인트 없음)

- [ ] **Step 3: serializer 함수 추가**

`backend/routers/mb_serializers.py`의 `unit_supply_to_dict` 함수(라인 317~331) 다음에 추가:

```python
def rental_schedule_to_dict(r) -> dict:
    """RentalScheduleOfficial ORM → dict (공공지원 민간임대 공고 일정)"""
    return {
        "kind": "rental",
        "house_manage_no": r.house_manage_no,
        "pblanc_no": r.pblanc_no,
        "house_nm": r.house_nm,
        "address": r.address,
        "recruit_date": r.recruit_date.isoformat() if r.recruit_date else None,
        "receipt_bgnde": r.receipt_bgnde.isoformat() if r.receipt_bgnde else None,
        "receipt_endde": r.receipt_endde.isoformat() if r.receipt_endde else None,
        "winner_announce_date": r.winner_announce_date.isoformat() if r.winner_announce_date else None,
        "move_in_ym": r.move_in_ym,
        "tot_supply": r.tot_supply,
        "pblanc_url": r.pblanc_url,
        "biz_entity": r.biz_entity,
        "constructor_name": r.constructor,
        "region_code": r.region_code,
        "fetched_at": r.fetched_at.isoformat() if r.fetched_at else None,
    }


def rental_unit_supply_to_dict(u) -> dict:
    """RentalUnitSupply ORM → dict (공공지원 민간임대 평형별 공급정보)"""
    return {
        "id": u.id,
        "house_manage_no": u.house_manage_no,
        "model_no": u.model_no,
        "house_ty": u.house_ty,
        "supply_area": u.supply_area,
        "exclusive_area": u.exclusive_area,
        "contract_area": u.contract_area,
        "general_supply": u.general_supply,
        "youth_supply": u.youth_supply,
        "newlywed_supply": u.newlywed_supply,
        "elderly_supply": u.elderly_supply,
        "monthly_rent": u.monthly_rent,
        "deposit": u.deposit,
    }
```

기존 `presale_schedule_to_dict` 함수(라인 269~278 근처)를 찾아서, `"kind": "officetel"` 필드를 반환 dict에 추가(FE가 오피스텔/민간임대 구분에 쓰는 필드 — Step 1 테스트의 `kinds` 단언과 짝).

- [ ] **Step 4: 라우터 엔드포인트 추가**

`backend/routers/mb.py`의 `get_presale_detail` 함수(라인 249~294) 다음, `get_competition` 함수 앞에 추가:

```python
@router.get("/presale/officetel-rental")
def get_officetel_rental(
    region: Optional[str] = Query(None, min_length=2, max_length=20, description="시도"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """오피스텔·도시형 + 공공지원 민간임대 청약 목록 (분양 탭 4번째 세그먼트, 이슈 #323).

    오피스텔은 apartments 로스터 매칭분(house_type='officetel'), 민간임대는
    독립 로스터(rental_schedule_official) — 서로 다른 테이블을 한 목록으로 합친다.
    """
    officetel_rows = mb_queries.get_officetel_schedules(db, region=region)
    rental_rows = mb_queries.get_rental_schedules(db, region=region)

    items = [presale_schedule_to_dict(s) for s in officetel_rows] + [
        rental_schedule_to_dict(r) for r in rental_rows
    ]
    # 공고일 최신순 통합 정렬 (kind 무관)
    items.sort(key=lambda x: x.get("recruit_date") or "", reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    paged = items[start : start + page_size]

    return {"items": paged, "total": total, "page": page, "page_size": page_size}
```

- [ ] **Step 5: 쿼리 함수 추가**

`backend/db/mb_apartment_queries.py`의 `get_presale_schedules` 함수(라인 228~237) 다음에 추가:

```python
def get_officetel_schedules(
    db: Session, region: Optional[str] = None
) -> list[PresaleScheduleOfficial]:
    """오피스텔·도시형 청약 일정 전체 (house_type='officetel', recruit_date DESC)."""
    stmt = (
        select(PresaleScheduleOfficial)
        .where(PresaleScheduleOfficial.house_type == "officetel")
        .order_by(PresaleScheduleOfficial.recruit_date.desc().nullslast())
    )
    return list(db.execute(stmt).scalars().all())
```

`backend/db/mb_misc_queries.py`(또는 신규 파일)에 추가:

```python
def get_rental_schedules(
    db: Session, region: Optional[str] = None
) -> list["RentalScheduleOfficial"]:
    """공공지원 민간임대 청약 일정 전체 (region_code 필터, recruit_date DESC)."""
    from db.mb_models import RentalScheduleOfficial

    stmt = select(RentalScheduleOfficial).order_by(
        RentalScheduleOfficial.recruit_date.desc().nullslast()
    )
    if region:
        stmt = stmt.where(RentalScheduleOfficial.region_code == region)
    return list(db.execute(stmt).scalars().all())
```

`backend/db/mb_queries.py` barrel export에 `get_officetel_schedules`, `get_rental_schedules` 추가.

- [ ] **Step 6: import 추가**

`backend/routers/mb.py` 상단 import에 `rental_schedule_to_dict` 추가 (기존 `presale_schedule_to_dict` import 라인 옆).

- [ ] **Step 7: 테스트 재실행 (통과 확인)**

Run: `cd backend && python -m pytest tests/test_mb_officetel_rental_api.py -v`
Expected: PASS (2개 전부)

- [ ] **Step 8: 전체 회귀 확인**

Run: `cd backend && ruff check . && python -m pytest --tb=short -q`
Expected: 전부 PASS

- [ ] **Step 9: Commit**

```bash
git add backend/routers/mb_serializers.py backend/routers/mb.py backend/db/mb_apartment_queries.py backend/db/mb_misc_queries.py backend/db/mb_queries.py backend/tests/test_mb_officetel_rental_api.py
git commit -m "feat(mb): 오피스텔·민간임대 통합 조회 API (/presale/officetel-rental)"
```

> **release.md 트리거**: `routers/mb.py` 변경 — 머지 후 zombie cross-check 의무.

---

## Part D — 프론트엔드

### Task 8: 타입 + API 함수

**Files:**
- Modify: `frontend/src/types/mibunyang.ts` (MbOfficetelRentalItem 타입 추가)
- Modify: `frontend/src/lib/api/mibunyang.ts` (getMbOfficetelRental 함수 추가)
- Test: `frontend/src/lib/__tests__/mb-officetel-rental-api.test.ts`

**Interfaces:**
- Consumes: BE `GET /api/mb/presale/officetel-rental` 응답 형태(Task 7)
- Produces: `MbOfficetelRentalItem` 타입, `getMbOfficetelRental(region?, page?, pageSize?) -> Promise<{items, total, page, page_size}>` — Task 9(컴포넌트)가 이 함수로 useQuery

- [ ] **Step 1: 타입 추가**

`frontend/src/types/mibunyang.ts` 파일 끝에 추가:

```typescript
/** 오피스텔·민간임대 청약 목록 항목 (get_officetel_rental 응답, 이슈 #323).
 * kind 로 오피스텔(apartments 연결)/민간임대(독립)를 구분 — BE presale_schedule_to_dict
 * /rental_schedule_to_dict 짝꿍(routers/mb_serializers.py). */
export interface MbOfficetelRentalItem {
  kind: "officetel" | "rental";
  house_manage_no: string;
  pblanc_no?: string | null;
  /** kind="officetel" 일 때만 존재 (apartments 로 이동 가능) */
  apartment_id?: string;
  /** kind="rental" 일 때만 존재 (독립 매물명) */
  house_nm?: string;
  address?: string | null;
  recruit_date?: string | null;
  receipt_bgnde?: string | null;
  receipt_endde?: string | null;
  winner_announce_date?: string | null;
  move_in_ym?: string | null;
  tot_supply?: number | null;
  pblanc_url?: string | null;
  biz_entity?: string | null;
  constructor_name?: string | null;
  region_code?: string | null;
  fetched_at?: string | null;
}
```

- [ ] **Step 2: API 함수 실패 테스트 작성**

`frontend/src/lib/__tests__/mb-officetel-rental-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMbOfficetelRental } from "@/lib/api";

describe("getMbOfficetelRental", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 응답을 그대로 반환한다", async () => {
    const mockData = {
      items: [{ kind: "officetel", house_manage_no: "123", recruit_date: "2026-08-01" }],
      total: 1,
      page: 1,
      page_size: 50,
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await getMbOfficetelRental();
    expect(result.total).toBe(1);
    expect(result.items[0].kind).toBe("officetel");
  });

  it("5xx 에러는 reject 한다 (error-propagation.md — 삼킴 금지)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(getMbOfficetelRental()).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 테스트 실행 (실패 확인)**

Run: `cd frontend && npx vitest run src/lib/__tests__/mb-officetel-rental-api.test.ts`
Expected: FAIL (`getMbOfficetelRental` not exported)

- [ ] **Step 4: `frontend/src/lib/api/mibunyang.ts` 기존 `getMbPresale` 함수 패턴 확인**

`frontend/src/lib/api/mibunyang.ts`를 Read해서 기존 `getMbPresale`·`getMbCompetition` 함수의 정확한 시그니처(fetchApi 래퍼 사용법, 쿼리스트링 조립 방식)를 확인 — 그 패턴을 그대로 재사용해야 error-propagation.md의 "래퍼 레벨 삼킴 금지" 규칙을 자동으로 준수한다(fetchApi가 이미 그 처리를 하므로).

- [ ] **Step 5: API 함수 구현**

`frontend/src/lib/api/mibunyang.ts`에 (기존 `getMbPresale` 함수 바로 다음) 추가 — 정확한 `fetchApi` 호출 형태는 Step 4에서 확인한 기존 함수 패턴을 그대로 복사해 이식:

```typescript
export async function getMbOfficetelRental(
  region?: string,
  page = 1,
  pageSize = 50,
): Promise<{ items: MbOfficetelRentalItem[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams();
  if (region) params.set("region", region);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return fetchApi(`/api/mb/presale/officetel-rental?${params}`);
}
```

(`fetchApi` import와 `MbOfficetelRentalItem` 타입 import를 파일 상단에 추가)

- [ ] **Step 6: `lib/api/index.ts`(barrel) 재노출 확인**

`frontend/src/lib/api.ts` 또는 barrel 파일에 `getMbOfficetelRental`이 re-export 되는지 확인(기존 9모듈 barrel 패턴 — `getMbPresale`이 어떻게 노출되는지 보고 동일하게).

- [ ] **Step 7: 테스트 재실행 (통과 확인)**

Run: `cd frontend && npx vitest run src/lib/__tests__/mb-officetel-rental-api.test.ts`
Expected: PASS (2개 전부)

- [ ] **Step 8: 타입 체크**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/mibunyang.ts frontend/src/lib/api/mibunyang.ts frontend/src/lib/__tests__/mb-officetel-rental-api.test.ts
git commit -m "feat(mb): 오피스텔·민간임대 타입 + API 함수"
```

---

### Task 9: 정렬 옵션 + query-keys

**Files:**
- Modify: `frontend/src/lib/mb-sort-options.ts` (MB_OFFICETEL_RENTAL_SORT_OPTIONS 추가)
- Modify: `frontend/src/lib/query-keys.ts` (officetelRental 쿼리키 추가)
- Modify: `backend/routers/mb.py` (MbOfficetelRentalSortBy Literal 추가, BE 짝꿍)

**Interfaces:**
- Consumes: 없음
- Produces: `MB_OFFICETEL_RENTAL_SORT_OPTIONS` — Task 10(컴포넌트)이 `MbSortSelect`에 전달

- [ ] **Step 1: BE 정렬 Literal 추가**

`backend/routers/mb.py`의 `MbCompetitionSortBy` 선언(라인 205~207) 다음에 추가:

```python
MbOfficetelRentalSortBy = Literal[
    "recruit_date_desc",
]
```

(1차 구현은 공고일 최신순 고정 — 오피스텔/임대가 섞인 목록이라 가격·경쟁률 정렬은 두 종류의 단위가 달라 후속 PR로 미룬다, YAGNI)

`get_officetel_rental` 엔드포인트(Task 7 Step 4)의 정렬은 이미 하드코딩(`recruit_date` DESC)이므로 이 Literal은 향후 확장 대비용 — 지금은 라우터 파라미터에 굳이 안 걸어도 되지만, 확장자리를 SSOT에 남긴다.

- [ ] **Step 2: FE 정렬 옵션 추가**

`frontend/src/lib/mb-sort-options.ts` 파일 끝에 추가:

```typescript
/** 오피스텔·민간임대 정렬 — BE routers/mb.py MbOfficetelRentalSortBy 짝꿍.
 * 1차 구현은 공고일순 고정(오피스텔·임대 단위가 달라 가격·경쟁률 정렬은 후속 PR, 이슈 #323). */
export const MB_OFFICETEL_RENTAL_SORT_OPTIONS: { v: string; l: string }[] = [
  { v: "recruit_date_desc", l: "공고일 최신순" },
];
```

- [ ] **Step 3: query-keys 추가**

`frontend/src/lib/query-keys.ts`의 `mb.presale` 근처(기존 `mb.competition` 옆)에 추가:

```typescript
    officetelRental: (region?: string, page?: number) =>
      ["mb", "officetelRental", region, page] as const,
```

- [ ] **Step 4: 타입 체크 + lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Run: `cd backend && ruff check .`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mb-sort-options.ts frontend/src/lib/query-keys.ts backend/routers/mb.py
git commit -m "feat(mb): 오피스텔·민간임대 정렬 옵션 SSOT (FE+BE 짝꿍)"
```

---

### Task 10: 세그먼트 추가 + 목록 컴포넌트

**Files:**
- Modify: `frontend/src/components/mb/MbPresaleTab.tsx` (PRESALE_SEGMENTS에 officetel_rental 추가, 세그먼트 렌더 분기)
- Create: `frontend/src/components/mb/MbOfficetelRentalTable.tsx`
- Test: `frontend/src/components/mb/__tests__/MbOfficetelRentalTable.test.tsx`

**Interfaces:**
- Consumes: `MbOfficetelRentalItem` 타입(Task 8), `getMbOfficetelRental`(Task 8), `MB_OFFICETEL_RENTAL_SORT_OPTIONS`(Task 9)
- Produces: `MbOfficetelRentalTable` 컴포넌트 — Task 10 자신이 MbPresaleTab에 배선

- [ ] **Step 1: 목록 컴포넌트 실패 테스트 작성**

`frontend/src/components/mb/__tests__/MbOfficetelRentalTable.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MbOfficetelRentalTable from "@/components/mb/MbOfficetelRentalTable";
import type { MbOfficetelRentalItem } from "@/types";

describe("MbOfficetelRentalTable", () => {
  it("오피스텔·민간임대 뱃지를 구분해서 표시한다", () => {
    const items: MbOfficetelRentalItem[] = [
      { kind: "officetel", house_manage_no: "1", apartment_id: "ah-1", recruit_date: "2026-08-01" },
      { kind: "rental", house_manage_no: "2", house_nm: "임대주택B", recruit_date: "2026-08-02" },
    ];
    render(<MbOfficetelRentalTable items={items} />);

    expect(screen.getByText("오피스텔")).toBeInTheDocument();
    expect(screen.getByText("임대")).toBeInTheDocument();
    expect(screen.getByText("임대주택B")).toBeInTheDocument();
  });

  it("빈 목록이면 안내 문구를 표시한다", () => {
    render(<MbOfficetelRentalTable items={[]} />);
    expect(screen.getByText(/등록된.*없습니다/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd frontend && npx vitest run src/components/mb/__tests__/MbOfficetelRentalTable.test.tsx`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `MbPresaleTable.tsx` 기존 구조 확인**

`frontend/src/components/mb/MbPresaleTable.tsx`를 Read해서 기존 테이블 행 렌더 패턴(사업주체·공고일 표시 방식, `<tr>` 클릭 핸들러 유무)을 확인 — HTML semantics 규칙(`<Link>`로 `<tr>` 감싸지 않기, web-rules.md) 그대로 재사용.

- [ ] **Step 4: 목록 컴포넌트 구현**

`frontend/src/components/mb/MbOfficetelRentalTable.tsx`:

```typescript
"use client";

import type { MbOfficetelRentalItem } from "@/types";

/** 오피스텔·민간임대 통합 목록 (이슈 #323). kind 로 유형 뱃지 구분.
 * 오피스텔은 apartment_id 로 기존 상세 페이지 연결 가능, 민간임대는 독립 매물이라
 * 상세 진입 없이 목록 정보만 표시(1차 구현 범위 — 상세 페이지는 후속 PR). */
interface Props {
  items: MbOfficetelRentalItem[];
}

export default function MbOfficetelRentalTable({ items }: Props) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">등록된 오피스텔·민간임대 청약 공고가 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-gray-600">유형</th>
            <th className="px-3 py-2 text-left text-gray-600">이름</th>
            <th className="px-3 py-2 text-left text-gray-600 hidden sm:table-cell">주소</th>
            <th className="px-3 py-2 text-right text-gray-600">공고일</th>
            <th className="px-3 py-2 text-right text-gray-600 hidden sm:table-cell">공급세대</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.kind}-${item.house_manage_no}`} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              <td className="px-3 py-2">
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    item.kind === "officetel" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {item.kind === "officetel" ? "오피스텔" : "임대"}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-gray-800">
                {item.kind === "rental" ? item.house_nm : item.apartment_id}
              </td>
              <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{item.address ?? "-"}</td>
              <td className="px-3 py-2 text-right text-gray-700">{item.recruit_date ?? "-"}</td>
              <td className="px-3 py-2 text-right text-gray-700 hidden sm:table-cell">
                {item.tot_supply?.toLocaleString() ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: 테스트 재실행 (통과 확인)**

Run: `cd frontend && npx vitest run src/components/mb/__tests__/MbOfficetelRentalTable.test.tsx`
Expected: PASS (2개 전부)

- [ ] **Step 6: Commit (컴포넌트만 우선)**

```bash
git add frontend/src/components/mb/MbOfficetelRentalTable.tsx frontend/src/components/mb/__tests__/MbOfficetelRentalTable.test.tsx
git commit -m "feat(mb): 오피스텔·민간임대 목록 테이블 컴포넌트"
```

---

### Task 11: MbPresaleTab 세그먼트 배선 + page.tsx URL 상태

**Files:**
- Modify: `frontend/src/components/mb/MbPresaleTab.tsx`
- Modify: `frontend/src/app/mibunyang/page.tsx`
- Test: `frontend/src/components/mb/__tests__/MbPresaleTab.test.tsx`(기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `MbOfficetelRentalTable`(Task 10), `getMbOfficetelRental`(Task 8), `MB_OFFICETEL_RENTAL_SORT_OPTIONS`(Task 9)
- Produces: 없음 (터미널 태스크 — 화면에서 실제로 도달 가능해짐)

- [ ] **Step 1: 기존 MbPresaleTab 테스트에 신규 세그먼트 케이스 추가**

`frontend/src/components/mb/__tests__/MbPresaleTab.test.tsx`를 Read하고, 기존 테스트가 `presaleQuery`/`competitionQuery` mock을 어떻게 구성하는지 패턴을 확인한 뒤, 아래 케이스를 추가:

```typescript
it("officetel_rental 세그먼트 클릭 시 4번째 탭이 활성화된다", async () => {
  const user = userEvent.setup();
  render(
    <MbPresaleTab
      segment="private"
      onSegmentChange={vi.fn()}
      presaleQuery={makeQueryResult({ presale: [], total: 0, page: 1, page_size: 50 })}
      competitionQuery={makeQueryResult({ competition: [], total: 0, page: 1, page_size: 50 })}
      officetelRentalQuery={makeQueryResult({ items: [], total: 0, page: 1, page_size: 50 })}
      page={1}
      sort=""
      onSortChange={vi.fn()}
      onPageChange={vi.fn()}
      isInCompare={() => false}
      onCompareToggle={vi.fn()}
      compareFull={false}
      viewMode="list"
      onViewModeChange={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("tab", { name: "오피스텔·임대" }));
  expect(screen.getByRole("tab", { name: "오피스텔·임대" })).toHaveAttribute("aria-selected", "true");
});
```

(`makeQueryResult` 헬퍼가 기존 테스트 파일에 이미 있으면 재사용, 없으면 기존 mock 패턴을 그대로 따라 인라인 작성)

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `cd frontend && npx vitest run src/components/mb/__tests__/MbPresaleTab.test.tsx`
Expected: FAIL (officetelRentalQuery prop 없음 / "오피스텔·임대" 탭 없음)

- [ ] **Step 3: PRESALE_SEGMENTS 확장 + import**

`frontend/src/components/mb/MbPresaleTab.tsx` 라인 29~35:

```typescript
export type PresaleSegment = "private" | "public" | "competition" | "officetel_rental";

export const PRESALE_SEGMENTS: { key: PresaleSegment; label: string }[] = [
  { key: "private", label: "민간분양" },
  { key: "public", label: "LH공공분양" },
  { key: "competition", label: "분양결과" },
  { key: "officetel_rental", label: "오피스텔·임대" },
];
```

파일 상단 import에 추가:

```typescript
import MbOfficetelRentalTable from "@/components/mb/MbOfficetelRentalTable";
```

- [ ] **Step 4: props에 officetelRentalQuery 추가**

함수 시그니처(라인 42~74)에 추가:

```typescript
  officetelRentalQuery,
```
및 타입:
```typescript
  officetelRentalQuery: UseQueryResult<{ items: import("@/types").MbOfficetelRentalItem[]; total: number; page: number; page_size: number }>;
```

- [ ] **Step 5: 렌더 분기 추가**

라인 93~100(`isCompetition`, `query`, `items`, `sortOptions` 계산부)을 수정 — 세그먼트 3분기로 확장:

```typescript
  const isCompetition = segment === "competition";
  const isOfficetelRental = segment === "officetel_rental";
  const query = isCompetition ? competitionQuery : isOfficetelRental ? officetelRentalQuery : presaleQuery;
  const items = isCompetition
    ? competitionQuery.data?.competition ?? []
    : isOfficetelRental
      ? officetelRentalQuery.data?.items ?? []
      : presaleQuery.data?.presale ?? [];
  const total = query.data?.total ?? 0;
  const sortOptions = isCompetition
    ? MB_COMPETITION_SORT_OPTIONS
    : isOfficetelRental
      ? MB_OFFICETEL_RENTAL_SORT_OPTIONS
      : MB_PRESALE_SORT_OPTIONS;
  const defaultSortLabel = isCompetition
    ? "기본 (경쟁률 높은순)"
    : isOfficetelRental
      ? "기본 (공고일 최신순)"
      : "기본 (공고일 최신순)";
```

import에 `MB_OFFICETEL_RENTAL_SORT_OPTIONS` 추가(라인 17).

리스트뷰 렌더 분기(라인 160~187)를 수정:

```typescript
          <>
            {isCompetition ? (
              <MbCompetitionTable
                apartments={items as MbApartment[]}
                isInCompare={isInCompare}
                onCompareToggle={onCompareToggle}
                compareFull={compareFull}
              />
            ) : isOfficetelRental ? (
              <MbOfficetelRentalTable items={items as import("@/types").MbOfficetelRentalItem[]} />
            ) : (
              <MbPresaleTable
                apartments={items as MbApartment[]}
                isInCompare={isInCompare}
                onCompareToggle={onCompareToggle}
                compareFull={compareFull}
              />
            )}
```

> **주의**: `items`의 유니온 타입이 `MbApartment[] | MbOfficetelRentalItem[]`이 되어 `isInCompare`/`onCompareToggle`을 오피스텔·임대 항목에 넘기면 타입 에러 가능성 있음 — `MbOfficetelRentalTable`은 비교 기능 없이 렌더만 하므로 위 분기처럼 별도 경로로 빼서 `isInCompare` 등을 안 넘기면 안전. 지도뷰(`viewMode === "map"`) 분기는 이번 세그먼트에서 비활성화(오피스텔·임대는 좌표 데이터가 없어 지도 표시 불가 — 1차 구현 범위 밖, Step 6에서 지도 토글 자체를 숨김).

- [ ] **Step 6: 지도 토글 숨김 (오피스텔·임대 세그먼트는 좌표 없음)**

라인 125 `<MbViewToggle viewMode={viewMode} onChange={setViewMode} />` 를 조건부로 변경:

```typescript
        {!isOfficetelRental && <MbViewToggle viewMode={viewMode} onChange={setViewMode} />}
```

`isMap` 계산(라인 102)도 `officetel_rental`일 때 강제로 `false`:

```typescript
  const isMap = viewMode === "map" && !isOfficetelRental;
```

- [ ] **Step 7: page.tsx 배선**

`frontend/src/app/mibunyang/page.tsx`:
- 라인 7의 import에 `getMbOfficetelRental` 추가.
- `PRESALE_SEGMENTS`가 이미 `MbPresaleTab.tsx`에서 import되고 있으므로(라인 25, 41) 자동으로 4개 세그먼트가 반영됨 — `SEGMENT_KEYS` 계산(라인 41)도 자동 확장.
- 세그먼트 판정(라인 82) 기본값 `"private"` 유지, `officetel_rental`도 자동으로 유효값에 포함됨(변경 불필요, `PRESALE_SEGMENTS`가 SSOT).
- 라인 203~216(`presaleQuery`, `competitionQuery` 선언부) 다음에 추가:

```typescript
  const officetelRentalQuery = useQuery({
    queryKey: queryKeys.mb.officetelRental(region || undefined, page),
    queryFn: () => getMbOfficetelRental(region || undefined, page, PAGE_SIZE),
    enabled: onPresale && segment === "officetel_rental",
    placeholderData: keepPreviousData,
  });
```

- `<MbPresaleTab>` 호출부(라인 266~281)에 prop 추가:

```typescript
            officetelRentalQuery={officetelRentalQuery}
```

- `handleSegmentChange`(라인 150~157)는 이미 범용(`seg: PresaleSegment`)이라 수정 불필요 — `officetel_rental`도 자동으로 정렬 리셋됨.
- `handleTabChange`(라인 124~148)의 `if (t === "presale")` 분기도 이미 presale 탭 전체(세그먼트 무관)에 적용되므로 수정 불필요.

- [ ] **Step 8: 테스트 재실행 (통과 확인)**

Run: `cd frontend && npx vitest run src/components/mb/__tests__/MbPresaleTab.test.tsx`
Expected: PASS (기존 케이스 + 신규 케이스 전부)

- [ ] **Step 9: 전체 프론트 회귀 확인**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm test`
Expected: 전부 PASS (기존 1967개 + 신규 테스트)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/mb/MbPresaleTab.tsx frontend/src/app/mibunyang/page.tsx frontend/src/components/mb/__tests__/MbPresaleTab.test.tsx
git commit -m "feat(mb): 오피스텔·임대 세그먼트 배선 (분양 탭 4번째 탭 완성)"
```

---

### Task 12: 라이브 검증 + CLAUDE.md 갱신

**Files:**
- Modify: `CLAUDE.md` (테스트 카운트 갱신)
- Modify: `backend/CLAUDE.md` (V040~V042 마이그레이션 표 3행 추가)

**Interfaces:**
- Consumes: 전체 파이프라인(Task 1~11)
- Produces: 없음 (검증 + 문서 갱신 터미널 태스크)

- [ ] **Step 1: prod 마이그레이션 적용**

Supabase SQL Editor에서 V040 → V041 → V042 순서로 수동 실행(release.md 절차 — 자동 러너 없음). 실행 후 `information_schema.columns`/`information_schema.tables`로 컬럼·테이블 존재 확인.

- [ ] **Step 2: backend PR 머지 후 zombie cross-check**

release.md §2 절차대로: `orchestrator.pid` mtime, `backend.log` 첫 줄 부팅시각, `crawl_jobs`에 `officetel_presale`/`rental_presale` job_type 새 row 발생 여부(다음 월요일 05:00 이후 확인) 3중 체크.

- [ ] **Step 3: 수동 1회 트리거로 즉시 검증 (월요일까지 기다리지 않고)**

관리자 API `POST /api/admin/collect/officetel_presale`, `POST /api/admin/collect/rental_presale` 트리거가 있는지 `backend/routers/admin/collect.py`를 확인 — 있으면 그 경로로 즉시 1회 실행해 실제 데이터가 쌓이는지 검증. 없으면 이 트리거 등록 자체를 Task 6에 이미 포함됐는지 재확인(기존 잡들이 어떻게 관리자 수동 트리거를 지원하는지 패턴 확인 후 필요시 추가).

- [ ] **Step 4: 라이브 화면 실측**

chrome-devtools MCP로 `https://2u.pe.kr/mibunyang?tab=presale&seg=officetel_rental` 접속해 "오피스텔·임대" 탭이 실제로 클릭되고 데이터(또는 정상적인 빈 상태 문구)가 뜨는지 스크린샷으로 확인.

- [ ] **Step 5: 테스트 카운트 갱신**

`cd backend && python -m pytest --tb=short -q` 및 `cd frontend && npx vitest run` 최종 카운트를 확인해 `CLAUDE.md` §테스트 현황 표를 실측값으로 갱신.

- [ ] **Step 6: 마이그레이션 이력 표 갱신**

`backend/CLAUDE.md` §DB 마이그레이션 표에 V040~V042 3행 추가(기존 V039 행 패턴 그대로, 실행일·라이브검증 결과 기입).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md backend/CLAUDE.md
git commit -m "docs: 이슈 #323 청약홈 오피스텔·민간임대 편입 완료 — 테스트 카운트·마이그 이력 갱신"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

**Spec coverage**: 설계 문서 §2(수집주체)→Task6, §3(수집주기)→Task6, §4-1(오피스텔 스키마)→Task1, §4-2(민간임대 스키마)→Task2, §4-3(필드 매핑)→Task3+Task5 Step3.5, §5(화면)→Task10~11, §6(BE 라우터)→Task7, §7(구현순서)→전체 Task 순서, §8(쿼터)→Task6 주석에 근거 반영. 전 항목 커버.

**Placeholder scan**: "TBD"·"나중에" 패턴 없음. Task5의 민간임대 평형 필드명은 실제 미확인 값이라 Step 3.5로 사전 검증 스텝을 명시적으로 넣어 placeholder가 아닌 "검증 후 정정" 절차로 처리.

**Type consistency**: `MbOfficetelRentalItem`(Task8) → `MbOfficetelRentalTable`(Task10) → `MbPresaleTab`(Task11) 전체에서 동일 타입명 사용 확인. `getMbOfficetelRental` 함수명이 Task8(정의)·Task9(query-keys)·Task11(page.tsx 호출)에서 일관. `RentalScheduleOfficial`/`RentalUnitSupply` 클래스명이 Task2(정의)·Task5(수집기)·Task7(라우터) 전체에서 일관.

**Task 간 의존순서**: Task1·2(DB)는 독립 병렬 가능. Task3(API클라이언트)은 Task1·2 완료 불필요(독립). Task4는 Task1+3 의존, Task5는 Task2+3 의존(병렬 가능). Task6은 Task4+5 의존. Task7은 Task1+2 의존(Task4·5와 병렬 가능, 실제 데이터 없어도 라우터 코드는 작성 가능하나 테스트는 직접 INSERT로 자급자족). Task8은 Task7 의존(응답 형태). Task9는 독립. Task10은 Task8 의존. Task11은 Task9+10 의존. Task12는 전체 의존.
