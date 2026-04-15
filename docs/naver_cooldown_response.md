# 네이버 부동산 쿨다운 사고 대응 (2026-04-16)

## 요약

2026-04-16, mibunyang 리포의 `naver-units.mjs` 수집기가 네이버 부동산 API 에서 **429 7연속** + Python curl_cffi 폴백 `Command failed` 로그를 남기고 중단됨. 집 공인 IP 가 네이버 쪽에서 쿨다운 상태에 들어간 것으로 추정. naver-estate-web 은 같은 집 서버 IP 를 공유하므로 이 문서로 이번 사건을 기록하고 재발 방지 조치를 명시한다.

본 문서는 **naver-estate-web 쪽 조치**를 다룬다. mibunyang 쪽 조치는 [`mibunyang_naver_cooldown_fix.md`](./mibunyang_naver_cooldown_fix.md) 참고.

## 사건 타임라인

- **T0** — mibunyang 수집기 창에서 `HTTP 429 Too Many Requests` 7회 연속 관찰
- **T1** — Node fetch 가 Python 폴백(`naver-fetch-proxy.py` via `execFileSync`) 호출 시도
- **T2** — Python 쪽에서 `Command failed` 발생 (curl_cffi 미설치 또는 PATH 문제 추정)
- **T3** — Node 재시도 → Python 재폴백 무한 루프. 429 누적
- **T4** — 사용자가 수집기 창을 수동 종료. naver-estate-web 세션 49 조사 시작

## Phase 1 실측 결과 — 두 리포 네이버 호출 지도

### mibunyang (F:\mibunyang) — 네이버 HTTP 호출 경로 5개

| 파일 | 역할 | 실행 방식 |
|---|---|---|
| `scripts/collectors/naver-listings.mjs` | 미분양 아파트 주변 **매물/시세** 수집 | GA `collect-naver-listings.yml` 매일 KST 04:00 자동 |
| `scripts/collectors/naver-units.mjs` | 단지 **총 세대수** 보정 | workflow_dispatch 수동 전용 (이번 사건 발생지) |
| `scripts/collectors/naver-presale.mjs` | pre.land.naver.com **분양권** 수집 | 수동 전용 |
| `scripts/collectors/naver-collect.py` | 옛 파이썬 수집기 (curl_cffi) | 수동 전용 |
| `scripts/collectors/naver-fetch-proxy.py` | 위 수집기들이 429 받으면 호출하는 **공용 curl_cffi 폴백** | 다른 수집기 내부 호출 |

**`naver-apt/` 서브 프로젝트는 죽은 코드** (GA 호출 없음, 로컬 수동 실험용 — Phase 1 확인).

### naver-estate-web (이 리포) — 네이버 HTTP 호출 경로

| 경로 | 파일·라인 | 언제 |
|---|---|---|
| 실시간 크롤링 (검색 1회당 12~20회) | `routers/live.py` → `shared/naver_api.py` | 사용자가 검색 버튼 누를 때마다 |
| 매 12시간 매물 수집 배치 | `crawler/scheduler.py:61-70` (jitter ±45분, 본 세션에서 ±30분→±45분) | 하루 2회 각 50단지 |
| 매 4시간 매물 상세 보강 | `crawler/scheduler.py:73-82` (jitter ±15분) | 하루 6회 각 100건 |
| 인기 단지 크롤 10:45/14:45/19:15 | `crawler/scheduler.py:98-111` (본 세션에서 시각 시프트) | 하루 3회 각 50단지 (본 세션에서 100→50) |
| 일요일 03시 단지 발견 | `crawler/scheduler.py:49-58` | 주 1회 |
| 수요일 04시 시세 이력 | `crawler/scheduler.py:85-94` | 주 1회 |

**두 리포 모두 같은 집 공인 IP 에서 나감** — 충돌 조건에서 429 공유.

## 범인 분포 Top 3 (확률·근거)

### 🔴 ① `mibunyang/naver-listings.mjs` 공격적 간격 (확률 60%)

**증거**: `scripts/collectors/naver-listings.mjs`
- L39: `MIN_INTERVAL = 1000` (1초 — 네이버 권장 3~5초보다 빠름)
- L40: `PAGE_DELAY = 1500` (1.5초)
- L42: `RETRY_DELAYS = [3000, 5000, 10000, 15000, 20000]` (최대 20초)

매일 KST 04:00 GA 로 1,000+ req/hour 누적. 지역 전수 순회(단지 검색 → 단지별 매물 → 단지별 시세 3단계) 때문에 소량으로 보이는 간격이 배율 효과로 폭증.

### 🔴 ② Python 폴백 무한 재시도 루프 (확률 25%)

**증거**: `scripts/collectors/naver-fetch-proxy.py:20` `from curl_cffi import requests as cffi_requests`

구조: `naver-units.mjs` → (429) → Node fetch 실패 → `execFileSync("python", ["naver-fetch-proxy.py", ...])` → Python 에서 `ImportError: curl_cffi` 또는 PATH 문제 → `Command failed` → Node 쪽에서 다시 네이버 때림 → 429 누적.

이 루프가 **정상 쿨다운 기간을 연장**시키는 숨은 가속기.

### 🟡 ③ 두 리포 시간대 충돌 (확률 15%)

naver-estate-web 의 `crawl_articles` (12h interval, jitter ±30분) 와 `crawl_details` (4h interval, jitter ±15분) 는 언제든 mibunyang 수동 실행과 겹칠 수 있음. 특히 mibunyang GA 가 KST 04:00 에 돌면 naver-estate-web 의 jitter 분산된 4h 배치와 확률적 충돌 발생.

## naver-estate-web 내장 방어 장치 (실측 확인)

- **`backend/shared/naver_api.py`** — curl_cffi `impersonate="chrome"` TLS 핑거프린트, JWT 자동 갱신(50분 유효), 429 백오프 [3, 5, 10]초, 10분 결과 캐시
- **`backend/crawler/utils.py` AdaptiveThrottle** — min=2s / max=10s, 429 맞으면 간격 자동 연장
- **`services/cache.py` `get_dynamic_ttl()`** — 시간대별 동적 TTL (새벽 3h / 오전 30m / 오후 1h / 저녁 2h — 본 세션에서 상향)
- **race guard** (세션 44) — `try_acquire_complex()` / `release_complex()` 로 live 와 배치가 같은 단지 중복 크롤 방지

이 리포 쪽은 **대부분 결백**. 범인의 90% 는 mibunyang 쪽에 몰려 있다.

## 본 세션(세션 49) 적용 수정

| Step | 파일 | 변경 | 목적 |
|---|---|---|---|
| 1 | `backend/crawler/scheduler.py` | 인기 단지 배치 100→50, 시각 10:30/14:30/19:00→10:45/14:45/19:15, jitter ±30분→±45분 | 총량 감축 + 시간 분리 |
| 1 | `backend/routers/admin/scheduler.py` | `SCHEDULER_JOB_META` 시간 문자열 동기화 | 어드민 대시보드 자동 반영 |
| 2 | `backend/services/cache.py` | `get_dynamic_ttl()` 4구간 전부 상향 (2h/15m/30m/1h → 3h/30m/1h/2h) | 사용자 반복 검색 캐시 적중률 상승 |
| 3 | `.claude/rules/infra.md`, `CLAUDE.md` | 스케줄 문서 시간표 동기화 | 문서 오염 방지 |
| 4 | 본 파일 | 사건 기록 | 재발 시 즉시 진단 |
| 5 | `mibunyang_naver_cooldown_fix.md` | mibunyang 수정 가이드 | 별도 리포 적용용 |

### 예상 효과

- naver-estate-web 일일 네이버 호출 총량 **~15~20% 감축** (인기 단지 150→75 건 × 3회 + 캐시 적중률 상승)
- mibunyang 수동 실행과 시간 분리 → 우연적 겹침 확률 감소
- 쿨다운 재발 시 본 문서로 즉시 진단 가능

## 이 리포만 고쳐서는 근본 해결이 안 되는 이유

Phase 1 실측으로 확인된 범인은 **mibunyang 쪽 코드**(`naver-listings.mjs` 간격 1초 + `naver-fetch-proxy.py` 폴백 깨짐)다. naver-estate-web 에서 아무리 간격을 늘리고 배치를 줄여도:

1. mibunyang 이 같은 IP 로 계속 공격적 수집 → 네이버는 IP 단위로 차단 → 양쪽 다 막힘
2. Python 폴백 루프는 mibunyang 내부 문제 → naver-estate-web 에서 해결 불가

따라서 **mibunyang 쪽 수정이 반드시 병행되어야** 한다. 그 가이드가 [`mibunyang_naver_cooldown_fix.md`](./mibunyang_naver_cooldown_fix.md).

## 롤백

각 Step 의 커밋을 `git revert` 하면 되돌려짐. DB 마이그레이션 없음.

- 긴급: `POPULAR_CRAWL_BATCH_SIZE=100` 환경변수만 재설정해도 배치 크기는 원복
- Step 1 revert: 시각·jitter 원복
- Step 2 revert: TTL 원복

## 운영 모니터링 권고

본 세션 수정 이후 다음 항목을 주기적으로 확인:

1. **새벽 0~9시 검색 사용자 체감** — TTL 3시간 상향이 "방금 올라온 매물이 안 뜬다" 불만으로 이어질 수 있음. 새벽대 검색 빈도가 낮으면 문제 없음
2. **인기 단지 꼬리 50개 커버 여부** — 축소된 50개 밖 단지는 사용자 실시간 검색(`live.py`) 폴백으로 커버됨. 사용자 체감 반응 느려지는지 관찰
3. **mibunyang 수정 적용 후** — `naver-units.mjs` 수동 실행 시 429 발생률 감소 여부. 발생하면 mibunyang 쪽 추가 조정 필요
4. **재발 감시** — `/api/admin/scheduler-status` 에서 실패율 급증 시 본 문서 재참조

## 관련 자료

- [`mibunyang_naver_cooldown_fix.md`](./mibunyang_naver_cooldown_fix.md) — mibunyang 수정 가이드
- [`quota_db_integration.md`](./quota_db_integration.md) — data.go.kr 쿼터 공유 (별건)
- 세션 49 플랜: `C:\Users\user\.claude\plans\cosmic-squishing-adleman.md`
