# mibunyang 네이버 수집기 쿨다운 복구 가이드

> **이 문서는 naver-estate-web 리포에 보관되지만 실제 적용 대상은 별도 리포 `F:\mibunyang` 이다.** mibunyang 세션을 따로 열고 이 문서의 수정 4종을 순서대로 적용하면 된다.

## 배경

2026-04-16, `F:\mibunyang\scripts\collectors\naver-units.mjs` 수동 실행 중 네이버 부동산 API 에서 **429 7연속** + Python 폴백 `Command failed` 로그가 관찰됐다. naver-estate-web 세션 49 에서 Phase 1 실측을 한 결과 쿨다운의 실제 범인이 mibunyang 쪽 수집기에 있다는 것이 확인되었다 — 상세는 [`naver_cooldown_response.md`](./naver_cooldown_response.md).

naver-estate-web 쪽은 세션 49 에서 배치 축소·시각 시프트·TTL 상향을 완료했지만, **같은 집 공인 IP 이므로 mibunyang 쪽 수정 없이는 재발이 불가피**하다.

왜 이 문서가 naver-estate-web 에 있나?
- 두 리포가 같은 IP 자원을 공유하는 구조라 이 문서는 **공유 인프라 자료** 성격이다
- 세션 43 `quota_db_integration.md` 와 같은 패턴 — "원본은 naver-estate-web, 실제 적용은 mibunyang"

## 전제 확인 (적용 전 1회)

1. **mibunyang 리포 경로 고정**: `F:\mibunyang\` (메모리 상 이 경로 확정)
2. **git 상태 깨끗한지**: `cd /f/mibunyang && git status`
3. **현재 수집기 즉시 중단**: 돌고 있는 `naver-units.mjs` / `naver-listings.mjs` 창이 있으면 먼저 닫기
4. **집 공유기 재부팅(선택)**: 통신사별 DHCP lease 정책에 따라 IP 갱신 가능. 본 가이드 적용 전후 어느 쪽이든 OK

## 수정 4종

### 수정 ① `scripts/collectors/naver-listings.mjs` — 요청 간격 상향 (핵심)

**파일**: `F:\mibunyang\scripts\collectors\naver-listings.mjs`

**현재 값 (L39-42)**:
```javascript
const MIN_INTERVAL = 1000;        // 요청 간 최소 1초
const PAGE_DELAY = 1500;          // 페이지 간 1.5초
const MAX_RETRIES = 5;
const RETRY_DELAYS = [3000, 5000, 10000, 15000, 20000];
```

**변경 후**:
```javascript
const MIN_INTERVAL = 5000;        // 요청 간 최소 5초 (네이버 권장 3~5초 상단)
const PAGE_DELAY = 3000;          // 페이지 간 3초
const MAX_RETRIES = 5;
const RETRY_DELAYS = [10000, 20000, 40000, 60000, 120000];  // 최대 2분 백오프
```

**근거**: 네이버 쪽은 공식적으로 "IP당 초당 N건" 기준을 공개하지 않지만, naver-estate-web 의 `shared/naver_api.py` 가 실측 기반으로 2초 min 을 쓰고 있고 적응형으로 10초까지 자동 연장된다. 1초는 공격적 수집 그룹으로 분류될 확률이 높다.

**영향**: 하루 GA 실행(KST 04:00) 총 시간이 ~15분 → ~45분 으로 3배 증가. 동시성 문제 없으면 문제 없음. GA timeout 30분이면 늘려야 함 — 수정 ④ 참고.

### 수정 ② `scripts/collectors/naver-collect.py` — 파이썬 수집기도 동일 철학

**파일**: `F:\mibunyang\scripts\collectors\naver-collect.py`

**현재 값 (L94)**:
```python
def thr(s=1.0):
    global _lr
    d=time.time()-_lr
    if d<s:time.sleep(s-d)
    _lr=time.time()
```

throttle 함수 기본 간격이 **1.0 초**. 호출부 전수 확인 후 기본값을 5.0 으로 상향하거나, 호출부마다 `thr(5.0)` 으로 인자 명시.

**권장**: 기본값 자체를 `def thr(s=5.0):` 로 변경 — 기존 `thr()` 호출 전부 5초로 상향됨. 혹시 `thr(2.0)` 같은 명시 호출이 있으면 그건 그대로 두고 하드코딩 인자만 리뷰.

**추가**: 백오프 배열이 있으면 naver-listings.mjs 와 동일 철학으로 `[10, 20, 40, 60, 120]` 초 단위 상향.

### 수정 ③ Python 폴백 복구 — "Command failed" 루프 차단 (중요)

**문제**: `naver-units.mjs` 가 429 맞으면 `execFileSync("python", ["naver-fetch-proxy.py", ...])` 로 Python 폴백을 부른다. 그런데 집 서버에 `curl_cffi` 가 미설치 / PATH 어긋남 / `python` vs `py -3` 혼선이면 Python 쪽이 바로 비정상 종료 → Node 가 `Command failed` 받고 다시 네이버 fetch → 루프 → 429 누적.

**확인·복구 절차** (mibunyang 집 서버에서):

```bash
# 1) curl_cffi 설치 확인
python -c "import curl_cffi; print(curl_cffi.__version__)"

# 실패하면 설치
python -m pip install --upgrade curl_cffi

# 2) naver-fetch-proxy.py 단독 실행 sanity check
cd F:\mibunyang\scripts\collectors
python naver-fetch-proxy.py "https://new.land.naver.com/api/search?query=test&page=1&type=complex"
# → stdout 에 JSON 응답이 나오면 정상. "Command failed" 가 여기서 나오면 여기서 먼저 해결

# 3) Node 에서 Python 을 어떻게 부르는지 경로 확인
# naver-units.mjs 내부에 `execFileSync("python", ...)` 또는 `execFileSync("py", ["-3", ...])` 패턴 검색
# Windows 는 보통 `py -3` 이 안전. `python` 만 쓰면 PATH 의 첫 python 이 잡혀서 혼선
```

**권장 수정**: `naver-units.mjs` 의 Python 호출부를 환경변수로 빼기 — `const PYTHON_CMD = process.env.MIBUNYANG_PYTHON ?? "python";`. 그러면 PATH 문제 발생 시 환경변수 하나로 `py -3` 또는 절대경로로 우회 가능.

**마지막 방어선**: Python 폴백이 실패하면 Node 쪽은 **즉시 루프 탈출**해야 한다. `Command failed` 받고 다시 fetch 시도하는 로직이 있다면 그걸 "해당 작업 건너뛰기 + 재시도 대신 다음 단지로" 로 바꾸는 것이 쿨다운 연장을 막는 핵심.

### 수정 ④ `.github/workflows/collect-naver-listings.yml` — GA timeout·schedule 점검

**파일**: `F:\mibunyang\.github\workflows\collect-naver-listings.yml`

**현재 값 (L5 추정)**: `cron: '0 19 * * *'` (UTC 19:00 = KST 04:00) + concurrency group

**확인 사항**:
1. **timeout**: 수정 ① 로 수집 시간이 3배 늘어나므로 `timeout-minutes: 30` 이면 `60` 으로 늘려야 함
2. **cron 유지**: UTC 19:00 (KST 04:00) 는 naver-estate-web 새 시각 10:45/14:45/19:15 와 간격 충분 → 그대로 유지
3. **concurrency group**: `cancel-in-progress: false` 유지 (이전 실행이 끝나지 않으면 새 실행 안 돎)

**naver-units.yml**: workflow_dispatch 수동 전용 (Phase 1 실측). **자동 스케줄 추가 금지** — 이번 사건 재발 위험.

**secrets 주의**: mibunyang workflow 들이 `SUPABASE_SERVICE_KEY`, `MOIS_POP_KEY`, `MOLIT_KEY`, `KAKAO_KEY` 참조. 이 문서에는 **이름만** 언급, 값 복사 절대 금지. YAML 수정 시 `${{ secrets.XXX }}` 표현만 건드리고 실제 값은 절대 작업 중 텍스트로 노출하지 말 것.

## 각 수정의 예상 효과

| 수정 | 재발 확률 감소 | 수집 시간 | 비용 |
|---|---|---|---|
| ① naver-listings.mjs 간격 상향 | 높음 (가장 큰 효과) | ~3배 증가 (15분→45분) | 없음 |
| ② naver-collect.py 간격 상향 | 중간 (수동 실행 빈도 낮음) | 수동 실행 시 3배 | 없음 |
| ③ Python 폴백 복구 | **높음** (루프 차단이 핵심) | 해당 없음 | 없음 |
| ④ GA timeout·workflow 점검 | 낮음 (예방) | 해당 없음 | 없음 |

**예상 결과**: 본 수정 적용 + 공유기 재부팅(IP 갱신) 또는 자연 쿨다운 해제 → **~1~3일 내 정상화**. 단, 수정 ③ 가 제대로 안 되면 루프가 계속 쿨다운을 연장시켜 해제가 늦어진다.

## 검증 절차

### 적용 직후 (mibunyang 세션에서)

```bash
cd /f/mibunyang
git diff scripts/collectors/naver-listings.mjs  # L39-42 변경 확인
git diff scripts/collectors/naver-collect.py    # thr() 기본값 확인

# 단독 sanity
python -c "import curl_cffi; print(curl_cffi.__version__)"
```

### 소규모 dry-run (쿨다운 해제 후)

```bash
# naver-listings.mjs 는 --limit= 옵션 지원 (L52-53)
cd /f/mibunyang
node scripts/collectors/naver-listings.mjs --limit=5 --dry-run

# 429 발생 로그 카운트 확인. 0 이면 성공.
```

### 본격 재가동

쿨다운 해제 확인 후 GA 에서 수동 트리거 1회(`workflow_dispatch`) — 실패 없이 완료되면 다음 자동 실행(KST 04:00)에 맡긴다.

## 롤백

git revert 로 되돌림. 수정 ③ Python 폴백 복구는 rollback 할 필요 없음(설치만 한 거라 무해).

```bash
cd /f/mibunyang
git log --oneline -5
git revert <commit-hash>
```

## 관련 자료

- [`naver_cooldown_response.md`](./naver_cooldown_response.md) — naver-estate-web 쪽 기록
- naver-estate-web 세션 49 플랜: `C:\Users\user\.claude\plans\cosmic-squishing-adleman.md`
- mibunyang 수집기 실측 Phase 1 결과 (본 문서 전제)

## 다음 세션 체크리스트 (mibunyang 세션에서)

- [ ] 전제 확인 4항목
- [ ] 수정 ① naver-listings.mjs L39-42
- [ ] 수정 ② naver-collect.py thr() 기본값
- [ ] 수정 ③ curl_cffi 설치 확인 + sanity check + Python 호출 경로 환경변수화
- [ ] 수정 ④ GA timeout·cron 점검
- [ ] dry-run 검증
- [ ] 커밋·푸시 (mibunyang 리포 기준)
- [ ] naver-estate-web 세션에서 본 문서 "적용 완료" 체크마크 (선택)
