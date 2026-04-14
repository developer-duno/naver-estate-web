# data.go.kr 공유 쿼터 DB 연동 가이드 (mibunyang → naver-estate-web 공유)

## 배경

data.go.kr API 일일 쿼터 10,000회는 **동일 인증키**로 두 프로젝트(naver-estate-web, mibunyang)가 공유. 과거에는 각자 in-memory 카운터로 따로 세서 동시 실행 시 쿼터 초과 가능성이 있었음. naver-estate-web이 세션 33~35쯤 `RateLimitCounter` 테이블 기반 공유 카운터로 전환 완료. mibunyang은 아직 미연동.

## 연동 목표

mibunyang collector에서 data.go.kr 호출 직전·직후에 naver-estate-web이 쓰는 것과 동일한 `RateLimitCounter` 테이블에 원자적 INSERT/UPDATE → 두 프로젝트가 같은 카운터를 바라봄.

## 진실의 원천

naver-estate-web 구현:
- 파일: `backend/services/quota_db.py`
- 테이블 스키마: `backend/db/migrations/` 중 `rate_limit_counter` 또는 유사명
- 핵심 함수: `check_and_increment(service: str, today: date, cost: int) -> bool` (원자적)
- 서비스 키 네이밍: `data_go_kr:<collector_name>` (예: `data_go_kr:collect_public_trades`)

mibunyang collector 위치: `/f/mibunyang/scripts/collectors/*.mjs`

## 권장 연동 방식

### 옵션 A — Supabase client 직접 호출 (권장)

mibunyang은 이미 `_shared.mjs`에 `getSupabase()` helper가 있음. `RateLimitCounter` 테이블에 대해 RPC 또는 Postgres 함수로 원자적 카운터 증가를 호출:

```javascript
// scripts/collectors/_quota.mjs (신규)
import { getSupabase } from "./_shared.mjs";

const DAILY_LIMIT_DATA_GO_KR = 10000;

export async function checkAndIncrement(serviceKey, cost = 1) {
  const sb = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  // INSERT ON CONFLICT + RETURNING으로 원자 증가
  const { data, error } = await sb.rpc("increment_quota_counter", {
    p_service: serviceKey,
    p_date: today,
    p_cost: cost,
  });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  const { new_count, limit_exceeded } = data;
  if (limit_exceeded) {
    throw new Error(`[quota] ${serviceKey} daily limit exceeded: ${new_count}/${DAILY_LIMIT_DATA_GO_KR}`);
  }
  return new_count;
}
```

필요한 Postgres 함수(마이그레이션으로 1회 추가, naver-estate-web 쪽 마이그레이션 폴더에):

```sql
CREATE OR REPLACE FUNCTION increment_quota_counter(
  p_service text, p_date date, p_cost int
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_count int; v_limit int := 10000;
BEGIN
  INSERT INTO rate_limit_counter (service, date, count)
  VALUES (p_service, p_date, p_cost)
  ON CONFLICT (service, date) DO UPDATE SET count = rate_limit_counter.count + EXCLUDED.count
  RETURNING count INTO v_count;
  RETURN jsonb_build_object('new_count', v_count, 'limit_exceeded', v_count > v_limit);
END $$;
```

### 옵션 B — in-memory 폴백 유지

DB 장애 시 수집이 전면 중단되면 안 됨. naver-estate-web은 `quota_db.py`에서 DB 실패 시 in-memory fallback으로 떨어지는 패턴을 쓰므로 mibunyang도 동일하게:

```javascript
let memFallback = { date: null, counts: {} };
export async function checkAndIncrement(serviceKey, cost = 1) {
  try {
    return await dbCheckAndIncrement(serviceKey, cost);  // 위 옵션 A
  } catch (e) {
    // DB 장애 → in-memory로 폴백, 로그 남기기
    const today = new Date().toISOString().slice(0, 10);
    if (memFallback.date !== today) memFallback = { date: today, counts: {} };
    memFallback.counts[serviceKey] = (memFallback.counts[serviceKey] || 0) + cost;
    console.warn(`[quota] DB fallback (mem): ${serviceKey}=${memFallback.counts[serviceKey]}`);
    return memFallback.counts[serviceKey];
  }
}
```

## mibunyang 적용 지점

data.go.kr API를 호출하는 mibunyang collector:
- `scripts/collectors/collect-trades.mjs` — 국토교통부 실거래가 (매월 6일, ~1,500~3,800 호출)
- `scripts/collectors/collect-building-info.mjs` — 건축물대장 (매월 10일, ~8,500 호출, **가장 위험**)
- `scripts/collectors/collect-population.mjs`, `market-stats.mjs` — (매월 5일, ~100 호출)
- `scripts/collect-unsold-kosis.mjs` — KOSIS (KOSIS는 data.go.kr과 별개 쿼터이므로 대상 외)

각 collector 진입부에서:
```javascript
import { checkAndIncrement } from "./_quota.mjs";

// 호출 직전
await checkAndIncrement("data_go_kr:collect_building_info", 1);
// ... fetch ...
```

또는 배치 단위로 선 점유:
```javascript
// 1000건 수집 예정 → 선 점유
await checkAndIncrement("data_go_kr:collect_building_info", 1000);
```

## 동시성 주의

- naver-estate-web의 `collect_public_trades`는 **매주 토요일 05:00**, 약 3,600 호출.
- mibunyang `collect-building-info`는 **매월 10일**, 약 8,500 호출.
- 두 작업이 같은 날 겹치면 3,600 + 8,500 = 12,100 > 10,000 쿼터 초과.
- 현재 naver-estate-web이 이미 "매월 10일이 토요일이면 collect_public_trades skip" 방어 있음 (`env_common.py:43-46`).
- **mibunyang에도 대칭 방어 필요**: `collect-trades` 실행일이 토요일이면 건너뛰거나, 실행 전에 `checkAndIncrement(cost=3800)` 선점유로 실패 시 abort.

## 체크리스트 (mibunyang 세션에서 실행)

1. [ ] `scripts/collectors/_quota.mjs` 신규 파일 작성 (옵션 A + 폴백)
2. [ ] Postgres 함수 `increment_quota_counter` 마이그레이션 — naver-estate-web 쪽에 migration 파일로 추가 (둘 다 같은 DB 쓰므로)
3. [ ] `collect-trades.mjs`, `collect-building-info.mjs`, `collect-population.mjs`, `market-stats.mjs`에 `checkAndIncrement` 호출 삽입 (4 파일, 각 2~3줄)
4. [ ] naver-estate-web의 `quota_db.py`가 같은 `RateLimitCounter` 테이블을 읽는지 확인 (read path 동일성)
5. [ ] 테스트: mock Supabase client로 `_quota.test.mjs` 작성 — 정상 경로 + DB 실패 → 폴백 + 한도 초과 → throw
6. [ ] dry-run: `collect-population.mjs`를 토요일에 실행해서 `rate_limit_counter` 테이블에 naver-estate-web과 같은 date row가 쌓이는지 DB 직접 SELECT로 확인

## 롤백

- mibunyang collector에서 `checkAndIncrement` 호출만 제거하면 원복 (기존 로직 변경 없음).
- Postgres 함수는 남겨둬도 naver-estate-web 쪽에 영향 없음.

## 연관 문서

- `f:/cursor/naver-estate-web/backend/services/quota_db.py` — Python 원본 구현
- `f:/cursor/naver-estate-web/.claude/rules/infra.md` — "공유 인프라 규칙 (mibunyang 프로젝트와 공유)" 섹션
- `f:/cursor/naver-estate-web/CLAUDE.md` — 공유 쿼터 DB 카운터 항목
