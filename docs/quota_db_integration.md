# data.go.kr 공유 쿼터 DB 연동 가이드 (mibunyang → naver-estate-web 공유)

> **버전 2** (2026-04-18 재작성). v1 (2026-04-15) 은 `services/quota_db.py` / `check_and_increment` / `rate_limit_counter` 단수형 등 실제 구현과 광범위하게 불일치했음. 이 가이드는 naver-estate-web 운영 코드를 직접 grep·read 한 **실측 기반**.

## 배경

data.go.kr API 일일 쿼터 10,000회는 **동일 인증키**로 두 프로젝트(naver-estate-web, mibunyang)가 공유. 과거에는 각자 in-memory 카운터로 따로 세서 동시 실행 시 쿼터 초과 가능성이 있었음. naver-estate-web 은 `RateLimitCounter` 테이블 기반 공유 카운터로 전환 완료. mibunyang 은 아직 미연동.

## 연동 목표

mibunyang collector 에서 data.go.kr 호출 직전·직후에 naver-estate-web 이 쓰는 것과 **동일한 `rate_limit_counters` 테이블의 동일한 키**에 원자적 INSERT/UPDATE → 두 프로젝트가 같은 카운터를 바라봄.

## 진실의 원천 (실측 위치)

| 항목 | 위치 |
|---|---|
| Python 구현 | `f:/cursor/naver-estate-web/backend/crawler/quota_db.py` |
| ORM 모델 | `backend/db/models.py:205 RateLimitCounter` |
| 호출처 1 | `backend/crawler/public_data_base.py:36-40` (스케줄러 진입부) |
| 호출처 2 | `backend/crawler/public_data_api.py:78-82` (API 호출 전) |
| 현황 조회 | `backend/routers/admin/data.py:156-159` (`GET /api/admin/quota-status`) |
| 토요일 가드 | `backend/crawler/service_public.py:38-53`, 헬퍼 `env_common.py:43-46` |

## DB 스키마 명세 (절대 준수)

### 테이블

```
rate_limit_counters (이름 끝에 s, 복수형 주의)
├── key         TEXT          PRIMARY KEY
├── count       INTEGER       NOT NULL DEFAULT 0
└── expires_at  TIMESTAMPTZ   NOT NULL
```

> ⚠️ v1 가이드는 `rate_limit_counter` (단수) + `service / date / count` 컬럼이라고 적었지만 **전부 틀림**. 실제 SQLAlchemy 모델 (`db/models.py:205-210`) 기준은 위 표.

### 키 형식

```
quota:{api_name}:{YYYY-MM-DD}
```

- 예시: `quota:data_go_kr:2026-04-18`
- `api_name` 기본값: `data_go_kr`
- `YYYY-MM-DD` 는 **로컬 KST 기준 오늘 날짜** (Python `date.today().isoformat()` 결과).
- mibunyang 도 **반드시 같은 형식** 으로 키를 만들어야 카운터가 합쳐짐.

### `expires_at` 채우는 규칙

- 값: **내일 01:00 UTC** (= KST 10:00, 자정 + 1시간 안전 여유)
- naver-estate-web 의 `_expires_at_eod()` (`crawler/quota_db.py:23-26`) 와 동일하게 만들어야 함:

```python
# 참고: naver-estate-web 의 실제 코드
def _expires_at_eod() -> datetime:
    tomorrow = date.today() + timedelta(days=1)
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, 1, 0, 0, tzinfo=timezone.utc)
```

- INSERT 시 NOT NULL 위반 안 나게 **반드시** 채울 것.

## 원자 증가 SQL (그대로 복사)

### 증가 (INSERT or UPDATE)

```sql
INSERT INTO rate_limit_counters (key, count, expires_at)
VALUES ($1, 1, $2)
ON CONFLICT (key) DO UPDATE
  SET count = rate_limit_counters.count + 1
RETURNING count;
```

- `$1` = 키 문자열 (`quota:data_go_kr:2026-04-18`)
- `$2` = expires_at TIMESTAMPTZ (위 규칙)
- 반환값 `count` 가 9000 초과면 차단.

> ⚠️ v1 가이드는 `increment_quota_counter` 라는 Postgres 함수(RPC) 를 만들라고 했지만 **naver-estate-web 은 RPC 를 사용하지 않음**. 직접 `INSERT ... ON CONFLICT` 만 씀. mibunyang 도 같은 방식이 호환 보장.

### 현황 조회

```sql
SELECT count FROM rate_limit_counters WHERE key = $1;
```

- 행이 없으면 0회.

## 한도 명세

- **9,000 회** (= 일일 한도 10,000 의 90%, **10% 안전마진**)
- naver-estate-web 의 `DEFAULT_DAILY_LIMIT = 9000` (`crawler/quota_db.py:15`)
- **mibunyang 도 9,000 한도로 차단해야 호환**. 9,500 같은 어중간한 값을 쓰면 mibunyang 이 9,499 까지 쓰고 naver-estate-web 측이 9,500 에서 차단됐다고 착각.
- count > 9000 → 호출 차단 (네이버는 True/False 로 표현)

## DB 실패 시 동작 (권장)

naver-estate-web 동작 (`crawler/quota_db.py:57-59`):

```python
except Exception as e:
    logger.error("쿼터 DB 업데이트 실패 (메모리 폴백 사용): %s", e)
    return True  # DB 실패 시 호출 허용
```

→ DB 장애로 수집이 전면 중단되면 안 되므로 **호출 허용 (True 반환)**. 단, 로그는 반드시 남길 것.

mibunyang 도 동일 정책 권장. 자체 in-memory 카운터를 폴백으로 둘지는 mibunyang 측 결정.

## mibunyang 적용 지점

data.go.kr 를 호출하는 mibunyang collector (각 호출 직전에 카운터 체크):

| 파일 | 작업 | 추정 호출수 | 우선순위 |
|---|---|---|---|
| `scripts/collectors/collect-building-info.mjs` | 건축물대장 (매월 10일) | ~8,500 | 🔴 최우선 |
| `scripts/collectors/collect-trades.mjs` | 실거래가 (매월 6일) | ~1,500~3,800 | 🟡 |
| `scripts/collectors/collect-population.mjs` | 인구 (매월 5일) | ~50 | ⚪ |
| `scripts/collectors/market-stats.mjs` | 시세 통계 (매월 5일) | ~50 | ⚪ |

> KOSIS API 는 data.go.kr 과 별개 쿼터 → 대상 외.

호출 패턴 (의사 코드, 환경 무관):

```
1. 이번 호출이 N건이라면 (보통 1)
2. SQL 실행: INSERT ... ON CONFLICT ... RETURNING count  (위 SQL)
3. count > 9000 이면 throw / return / abort (수집 중단)
4. 그렇지 않으면 fetch() 진행
5. fetch 실패와 무관하게 카운터는 이미 증가됨 (data.go.kr 측이 호출은 받았으니 정확)
```

배치 단위 선점유 (8,500 건 한번에 가는 건축물대장):

```
1. 시작 전: count_after = current_count + 8500 예상
2. SQL 로 current count 조회 → 9000 - current > 8500 인지 확인
3. 부족하면 abort (오늘은 안 함)
4. 충분하면 진행, 매 호출마다 +1 카운터 증가
```

## 동시성 주의 (가장 위험한 충돌)

| 일자 | naver-estate-web | mibunyang | 합계 |
|---|---|---|---|
| 매주 토요일 05:00 | `collect_public_trades` ~3,600 | - | 3,600 |
| 매월 6일 | - | `collect-trades` ~1,500~3,800 | ~3,800 |
| 매월 10일 | - | `collect-building-info` ~8,500 | 8,500 |
| **매월 10일 + 토요일** | `collect_public_trades` ~3,600 | `collect-building-info` ~8,500 | **12,100 ❌ 초과** |

**naver-estate-web 측 방어 (이미 구현됨)**:
- `crawler/service_public.py:38-53` — 매월 10일 토요일이면 즉시 return + crawl_jobs 에 cancelled 기록
- 헬퍼: `crawler/env_common.py:43-46 _is_skip_day()`

**mibunyang 측 권장 대칭 방어**:
- (a) `collect-building-info.mjs` 진입 시 토요일이면 skip (역방향 — naver 가 이미 매월 10일 토요일을 양보하므로 mibunyang 은 skip 안 해도 되지만, 하나의 가드 더 두면 안전)
- 또는 (b) 시작 전 선점유 — 위 SQL 로 현재 count 조회 후 9000 - current < 8500 이면 abort. 이게 더 일반적.

## 체크리스트 (mibunyang 세션에서 실행)

1. [ ] mibunyang 환경에 맞는 SQL 호출 wrapper 작성 (Supabase JS client `.rpc()` 또는 `postgres-js` 직접 SQL — mibunyang 코드 컨벤션 따름)
2. [ ] 키 형식 `quota:data_go_kr:YYYY-MM-DD` 정확히 (KST 날짜 사용)
3. [ ] `expires_at` 내일 01:00 UTC 채우기 (NOT NULL)
4. [ ] 한도 9,000 (10,000 아님) 명시
5. [ ] 4 collector 진입부에 카운터 체크 삽입
6. [ ] 통합 테스트 — mock client 로 정상/한도초과/DB실패 3 케이스
7. [ ] dry-run — 평일에 collect-population 실행해서 DB 에 같은 키로 행이 늘어나는지 직접 SELECT 로 확인
8. [ ] `naver-estate-web/routers/admin/data.py:156-159` (`GET /api/admin/quota-status`) 가 mibunyang 증분도 보는지 같은 키로 검증

## 롤백

- mibunyang collector 에서 카운터 호출만 제거하면 원복 (기존 로직 변경 없음)
- naver-estate-web 측은 어떤 변경도 필요 없음 (이미 운영 중인 패턴 그대로)

## 자주 하는 실수

| 실수 | 결과 |
|---|---|
| 테이블 `rate_limit_counter` (단수) | 테이블 not found 에러 |
| 컬럼 `service`, `date`, `count` | column not found 에러 |
| 키 형식 `data_go_kr:collect_building_info` | naver-estate-web 카운터와 안 합쳐짐 |
| 키 형식 `quota:data_go_kr` (날짜 빠짐) | 어제·오늘 카운터 합산 → 매일 리셋 안 됨 |
| `expires_at` 빠뜨림 | NOT NULL 위반 |
| 한도 10,000 사용 | 9,001~10,000 구간에서 두 프로젝트가 서로 다르게 판단 |

## 연관 문서

- `f:/cursor/naver-estate-web/backend/crawler/quota_db.py` — Python 원본 구현
- `f:/cursor/naver-estate-web/.claude/rules/infra.md` — 공유 인프라 규칙 ("data.go.kr API 쿼터" 표)
- `f:/cursor/naver-estate-web/CLAUDE.md` — 공유 쿼터 DB 카운터 항목
