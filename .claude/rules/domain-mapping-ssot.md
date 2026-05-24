# 도메인 매핑 SSOT + SQL 집계 패턴

BE Python dict ↔ FE TypeScript 함수 짝꿍 매핑, SQL `GROUP BY` 의 N→1 합산 함정, BE 테스트 dialect 의존성 답습 규칙.

근거 사건은 모두 세션 225 (PR #57, 커밋 3461078, 2026-05-25) 의 단기임대 매물 wolse 시세 합산 silent failure 추적에서 도출.

## 룰 1 — BE-FE 매핑 dict 짝꿍 답습

### 트리거

다음 짝꿍 파일 어느 한쪽에 **매핑 dict 의 키 또는 값을 추가·변경·삭제** 할 때.

(주석·JSDoc·타입 시그니처만 변경하는 경우는 트리거 아님)

| BE | FE | 매핑 종류 |
| --- | --- | --- |
| `backend/db/price_queries.py:99` `tt_key_map` | `frontend/src/lib/trade-types.ts:17` `tradeKey()` | 거래유형 한글명 → 집계 키 |

### 답습

1. **양쪽 짝꿍 주석에 상대 파일경로:라인 명시** — 한쪽만 보고도 짝꿍이 어디 있는지 한 번에 찾을 수 있어야 한다.
2. **같은 세션에서 BE + FE + 회귀 테스트 동시 수정** — 한 쪽만 머지하면 silent confusion 이 발생한다. 회귀 테스트는 룰 2 의 시나리오 3종 답습.
3. **라인 번호 drift 점검 의무** — 파일 위·아래에 줄을 추가하면 짝꿍 주석에 박힌 라인 번호가 어긋난다. 매핑 변경 PR 마지막에 `grep "짝꿍 파일경로:" 양쪽_파일` 로 라인 번호 재확인.

### 현재 짝꿍 주석 박힘 위치 (실측)

- BE `backend/db/price_queries.py:95~99`: `"단기임대 → wolse 합산 ... FE tradeKey 짝꿍 답습 ... 본 dict + frontend/src/lib/trade-types.ts:18 양쪽 답습"`
- FE `frontend/src/lib/trade-types.ts:14~15`: `"BE db/price_queries.py:99 tt_key_map 과 짝꿍 ... 새 거래유형 추가 시 본 함수 + BE tt_key_map 양쪽 답습"`

### 확장 후보 (현재 트리거 표 본행 아님, 미래 작업자 판단 근거)

- `CrawlJob.status` (`backend/db/models.py:163`) ↔ `JOB_STATUS_STYLES` (`frontend/src/lib/admin/job-status-styles.ts:38`) — 세션 223 PR #52 답습 패턴이나 양방향 짝꿍 주석 미박힘. 짝꿍 주석 추가가 본행 승격의 전제.
- `brokerage.ts` `TradeType` — FE 단독, BE 짝꿍 없음 (공인중개사법 시행규칙 계산 전용 도메인이라 BE 영향 없음).
- `mb-house-type.ts` `HOUSE_TYPE_LABELS` — FE 단독, BE serializer 짝꿍 없음 (raw 노출 방지용 라벨만).

### 사건

2026-05-25 세션 224~225, 단기임대 매물 모달의 월세 시세 탭이 빈 박스로 표시된 silent confusion. 원인은 BE `tt_key_map` 에 `"단기임대"` 키가 없어 집계에서 누락된 반면 FE `tradeKey()` 는 이미 `"단기임대" → "wolse"` 를 반환하고 있었다. 양쪽 비대칭이 silent 였다. PR #57 (3461078) 로 양쪽 동시 정렬.

## 룰 2 — N→1 매핑 dict + SQL `GROUP BY` 덮어쓰기 검증 의무

### 트리거 (3 조건 AND)

1. 매핑 dict 가 **N→1 패턴** — 서로 다른 키가 같은 값을 가리킬 때 (예: `{"월세": "wolse", "단기임대": "wolse"}`).
2. SQL 이 **원본 값 기준 `GROUP BY trade_type_name`** 으로 행을 분리 반환.
3. Python 루프가 **출력 dict 키에 누적 없이 단순 대입** (`entry[key] = avg` 형태).

세 조건이 모두 참일 때만 트리거. 1대1 매핑이거나 합산 누적이 이미 있으면 트리거 아님.

### 답습

- SQL `GROUP BY` 가 같은 출력 키에 두 행 반환하면 **Python 루프 두 번째 행이 첫 번째를 덮어쓴다** — silent failure.
- **임시 누적 dict 로 가중평균 합산** — `area_wolse_accum`, `floor_wolse_accum` 같은 `dict[버킷, (count, sum)]` 으로 누적 후 가중평균 계산해 출력.
- 회귀 테스트는 **시나리오 3종** 의무 (이름 패턴은 권장, 강제 아님):
    1. **공존** (`_합산_to_X` 권장) — N개 키가 동일 출력 키로 들어올 때 카운트 합산 + 가중평균 정확.
    2. **단독** (`_X_only` 권장) — N개 중 1개만 있을 때 정상 집계.
    3. **미매핑** (`_unmapped_skipped` 권장) — 매핑 dict 에 없는 키는 카운트에 영향 0.

### 코드 인용 (`backend/db/price_queries.py:100~157`)

area 버킷 합산 핵심 패턴:

```python
area_wolse_accum: dict[float, tuple[int, int]] = {}  # (count, price_sum)
for row in area_rows:
    key = tt_key_map.get(tt)
    if key == "wolse" and bucket in area_wolse_accum:
        prev_cnt, prev_sum = area_wolse_accum[bucket]
        new_cnt = prev_cnt + cnt
        new_sum = prev_sum + avg * cnt
        area_wolse_accum[bucket] = (new_cnt, new_sum)
        entry[key] = new_sum // new_cnt if new_cnt else 0
        entry[f"{key}_count"] = new_cnt
    else:
        if key == "wolse":
            area_wolse_accum[bucket] = (cnt, avg * cnt)
        entry[key] = avg
        entry[f"{key}_count"] = cnt
```

floor 버킷 (`backend/db/price_queries.py:128~157`) 도 동일 패턴 + min/max 누적.

### 현재 BE 적용 범위

`get_price_stats_aggregated()` **1건 특수 사례**. 세션 225 에서 silent-failure-hunter 서브에이전트가 BE 전수 점검 (db/, routers/, services/, crawler/) 한 결과 다른 잠복 후보 0건 확정 (`get_trade_type_counts` 류는 4종 키 보존, 다른 GROUP BY 함수는 DB 가 묶어준 키를 그대로 출력 키로 사용해 충돌 없음).

미래에 새 N→1 매핑 dict 가 추가될 때 본 룰 트리거.

### 사건

세션 225 Step 2, "매핑 1줄만 추가하면 충분" 가설로 BE `tt_key_map` 에 `"단기임대": "wolse"` 만 추가했더니 회귀 테스트 `wolse_count` 가 1만 나와야 할 자리에 2가 안 나왔다. SQL `GROUP BY trade_type_name` 이 월세·단기임대 두 행을 분리 반환하고 Python 루프가 `entry["wolse"]` 를 덮어쓰고 있었음. 가중평균 누적 로직 + 테스트 3 케이스 추가로 완전 해결.

## 룰 3 — 테스트 0건 발견 시 dialect 의존성 의심 (BE 전용)

### 트리거 (3 조건 AND)

1. `backend/tests/` 에서 함수 X 의 직접 테스트가 **0건**.
2. 함수 내부에 `text("""...""")` **raw SQL**.
3. raw SQL 안에 **PostgreSQL 전용 문법** — grep 패턴: `~ '` (정규식) / `SPLIT_PART(` / `JSONB` / `ARRAY[`.

세 조건이 모두 참일 때만 트리거. ORM 쿼리이거나 SQLite 호환 raw SQL 은 자동 제외 — false positive 차단.

### 답습

- BE CI 엔진 = **SQLite** (`backend/tests/conftest.py`). PostgreSQL 전용 문법은 SQLite 에서 실행 불가 → 테스트 작성 자체가 불가능해 0건이 누적된다 (단순 누락이 아님).
- 해결책 = **dialect 분기** (`backend/db/price_queries.py:48` 답습):

    ```python
    dialect_name = db.bind.dialect.name if db.bind else ""
    if dialect_name == "postgresql":
        ...  # PostgreSQL 전용 SQL
    else:
        ...  # SQLite 우회 (빈 결과 또는 ORM 대체)
    ```

- 같은 패턴 적용 기존 함수:
    - `backend/services/upsert.py:16` `_do_upsert()` (dialect 분기 line 24, pg_insert / sqlite_insert 자동 분기)
    - `backend/services/naver_call_counter.py:41` `_record_call()` (dialect 분기 line 41)
    - `backend/routers/live/search.py:128` `_search_all_types()` (SQLite 순차 실행 분기 주석 시작)

### 사건

세션 225, `get_price_stats_aggregated()` 의 테스트 0건의 진짜 이유 추적 결과 = `floor_stmt` 에 PostgreSQL `~` regex 연산자 + `SPLIT_PART` 함수가 박혀 있어 SQLite 에서 실행 자체가 안 됐기 때문. dialect 분기 추가 후 `by_area` 집계 경로만 테스트로 회귀 가드, `by_floor` 는 SQLite 에서 빈 결과로 처리.

## 부록 — Cross-link

| 연관 파일 | 관련 내용 |
| --- | --- |
| `.claude/rules/codes.md` §거래유형 코드 | A1/B1/B2/B3 원본 표 (상위 SSOT). 표 행 변경 시 본 파일 룰 1 트리거 표도 갱신 |
| `backend/CLAUDE.md` §CI 테스트 인프라 | SQLite dialect 분기 선례 (`_search_all_types()`, `_do_upsert()`) |
| `backend/tests/test_price_queries.py` | 룰 1+2 회귀 테스트 3 케이스 실체 |
| `frontend/src/lib/trade-types.ts` | FE 짝꿍 `tradeKey()` 전체 |
| `backend/db/price_queries.py` | BE 짝꿍 `tt_key_map` + 합산 로직 전체 |
