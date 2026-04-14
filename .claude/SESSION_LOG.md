# 다음 세션 시작 명령어 (복붙용)

```
세션 40 시작. 세션 39(2026-04-14)에서 어린이집 silent success 가드(env_childcare.py +21/-2)만 커밋. API 파라미터 수정(childcare_api.py)은 CPMS 명세 재확인 대기로 보류.

자동 점검 3가지:
1. memory/project_childcare_trigger_bug.md 재독 — 세션 39 A단계 발견 반영(INFO-200, arcode/stcode 조합은 통과하지만 0건)
2. git log --oneline -5 — 세션 39 커밋 확인
3. 집 서버 health

사용자 선결 조치:
- info.childcare.go.kr 활용신청 콘솔에서 cpmsapi030 요청/응답 스펙 확인 → 다음 중 하나 공유
  (a) arcode/stcode 코드 체계 (행정표준 vs CPMS 내부)
  (b) 필수 파라미터 전체 목록
  (c) 샘플 호출 curl 예시

공유 받으면 /harness 플랜 모드로 childcare_api.py 수정 설계(2곳, ~15줄).
명세 확인 불가면 다른 데이터 소스(data.go.kr 보건복지부 어린이집) 검토로 선회.
```

추가 과제 (시간 남을 시):
- `db.get(Infra) × 1949` → bulk `WHERE id IN (...)` 1회로 치환 (Supabase pooler 7분 timeout 해결)
- 오피스텔 면적 프리셋 (frontend/src/lib/constants.ts AREA_PRESETS)

---

# 세션 39 요약 (2026-04-14)

**핵심 성과**: 어린이집 silent success 가드 추가 (부분 해결). API 파라미터 수정은 명세 재확인 필요로 세션 40 분리.

## 완료

- `backend/crawler/env_childcare.py` — `collected == 0` 시 `status='failed'` + `error_message="시군구 N개 중 API empty M개"` 요약. 기존 4개월간 대시보드 거짓 "completed" 재발 차단.
- ruff + pytest 476 passed / 1 skipped.

## A단계 발견 (재진단)

세션 38의 "ERROR-100 = 필수값 누락" 가설은 **오류**. 실제 테스트:

| 조합 | 결과 | 해석 |
|---|---|---|
| `key=X&arcode=11&stcode=680` (강남구) | `INFO-200 검색결과 없음` | 파라미터 통과, 결과 0건 |
| `key=X&arcode=11` (서울 전체) | `INFO-200` | 동일 |
| `key=X&arcode=11&stcode=110` (종로) | `INFO-200` | 동일 |
| `serviceKey=X&...` (data.go.kr 표준) | `ERROR-100` | 이 API는 `key` 파라미터만 받음 |
| `numOfRows/pageNo/pageIndex/pageUnit` 추가 | `INFO-200` | 페이지네이션 효과 없음 |
| no-params | HTTP 500 | 완전 미인증 |

**결론**: `ERROR-100`은 인증/키 계열 오류. `arcode/stcode` 분리 가설 자체는 맞으나, 행정표준코드(11680=강남)로는 어떤 조합도 데이터를 반환하지 못함.

**추정 원인 (세션 40에서 확인 필요)**:
- `arcode/stcode`가 행정표준코드가 아닌 CPMS 내부 분류 코드
- 또는 cpmsapi030이 단건조회 API이고 리스트 조회는 cpmsapi021/022 등 별도

## 사용자 결정

**옵션 1+3 병행** 채택:
- 1: CPMS 포털 명세서 확인 (사용자)
- 3: silent failure 가드만 먼저 커밋 (완료)

---

# 세션 38 → 세션 39 시작 명령어 (legacy, 보관용)

```
세션 39 시작. 이전 세션 38(2026-04-14)에서 (1) 어린이집 수집기 silent failure 근본 원인 진단 + (2) Claude 환경 리뉴얼(글로벌/프로젝트 settings + MCP 27→10) 완료. 코드 변경은 없음.

자동 점검 4가지:
1. memory/project_childcare_trigger_bug.md 정독 (수정 플랜 3파일/~25줄)
2. memory/project_env_renewal.md 훑기 (리뉴얼 결과 + 롤백 .bak-pre-renewal 3개 위치)
3. git log --oneline -5 (세션 38은 커밋 없음, 마지막 커밋은 세션 37 5a8c702)
4. 집 서버 health: curl -s -o /dev/null -w "%{http_code}\n" https://api.2u.pe.kr/api/stats

그 다음 /harness 플랜 모드로 어린이집 수집기 수정 설계 (A→B→C→D):

A. cpmsapi030 올바른 파라미터 형식 검증 (선행, 필수, 코드 수정 금지)
   - backend 디렉토리에서 python-dotenv 로드 후 직접 호출로 조합 테스트:
     * arcode=11&stcode=680 (시도2+시군구3 분리, 유력)
     * arcode=11680&stcode= (현재 코드, 세션 38에서 실패 확인: ERROR-100)
     * 다른 파라미터명 가능성 (key vs servicekey 등)
   - 서울 강남구(코드 11680) 응답 성공 = item 여러 건 반환 확인되는 조합 확정
   - 이 단계 통과 못하면 수정 금지, CPMS 포털 문서 재확인

B. backend/crawler/childcare_api.py 수정 2곳 (~15줄)
   - _call_api 라인 81-113: 200 + <errcode>면 즉시 return [] + warning 로깅
     (현재는 fall-through → retry 루프 → silent None 반환)
   - get_childcare_list 라인 148-151: A 결과대로 arcode/stcode 분리

C. backend/crawler/env_childcare.py 수정 1곳 (~10줄)
   - collected=0이면 status='failed' + error_message에 "시군구 N개 중 empty M개" 요약
   - silent success 재발 방지

D. 검증
   - cd backend && ruff check . && python -m pytest --tb=short -q
   - /admin → 어린이집 버튼 → 200 OK + "수집 완료"
   - cd backend && python -c "from db.database import SessionLocal; from sqlalchemy import text; db=SessionLocal(); print(db.execute(text('SELECT COUNT(*) FROM infra WHERE childcare_count IS NOT NULL')).scalar())" → 0에서 증가 확인
   - 성공이면 /commit 로 커밋

제약:
- /harness 규칙: 3파일 / 100줄 이하
- bulk select 최적화(Supabase pooler 7분 timeout 대응)는 세션 40+로 분리
- 레거시 infra.childcare / childcare_dist 컬럼 건드리지 말 것 (mibunyang 소유)
- 시간 남으면 2순위: 오피스텔 면적 범위 프리셋 추가 (frontend/src/lib/constants.ts AREA_PRESETS)

사용자 수동 조치 (세션 시작 시 1회 안내만):
- Claude Code /mcp 슬래시커맨드 또는 claude.ai Connectors 설정에서 6개 해제:
  claude.ai Supabase / Canva / Make / Gamma / Gmail / Google Calendar
- 해제 후 MCP 최종 4개: context7, Figma, Vercel, Notion
- playwright MCP가 mcp list에 안 뜨면 E2E 필요 시 재등록:
  claude mcp add playwright -- npx -y @playwright/mcp@latest
```

**노트북에서 시작할 때 추가**: `먼저 git pull && /plugin (글로벌 스킬 17개 동기화)`

---

# 세션 38 요약 (2026-04-14)

**핵심 성과**: 어린이집 수집기 silent failure **근본 원인 확정** (4개월간 collected=0인데 "completed" 표시된 이유). 코드 미변경. 세션 39에서 수정 예정.

## 진단 경로

1. **/admin에서 수동 트리거 검증 시도** → Supabase MCP로 infra 쿼리 → 컬럼 없음 결론 내림 (**틀림**)
2. 사용자 지적: MCP가 잘못된 프로젝트(`chita-market`) 보고 있었음. 실제 DB는 `rwdtljipvmqpazrimyns` (naver-estate)
3. `backend/.env`의 DATABASE_URL로 `python -c "from db.database import SessionLocal"` 직접 쿼리로 전환 (앱과 동일 경로)
4. **실제 DB에서 확인된 사실**:
   - `childcare_count/nearest_*` 컬럼 다 존재 (V013+V019 적용됨)
   - 하지만 `infra` 1950행 중 `childcare_count IS NOT NULL` = **0건**
   - `crawl_jobs` 최신 `childcare` job (2026-04-14 09:12 UTC) = `failed`, error = Supabase pooler connection 7분 후 끊김
   - 이전 completed 기록 3건 = 전부 silent success (2~17초 실행, 실제 데이터 0건)
   - 레거시 `infra.childcare`(1950), `childcare_dist`(1898) = mibunyang 쪽이 예전에 채운 것
5. **silent failure 루트**: `resolve_sigungu_code` 성공률 96.9% 확인 → 매핑 문제 아님
6. **진짜 원인 확정**: CPMS API 직접 호출 테스트 → `<errcode>ERROR-100</errcode> 필수 값이 누락되어 있습니다`
   - **원인 A**: `childcare_api.py:148-151` params가 `arcode=11680, stcode=""` 로 전송. cpmsapi030은 arcode(2자리)+stcode(3자리) 분리 필요 (추정)
   - **원인 B**: `childcare_api.py:81-101` errcode 분기 fall-through 버그 — 200+errcode도 재시도 루프로 흘러가 최종 None 반환, 상위 레이어는 이를 "빈 결과"로 해석해 `_complete_job(collected=0)` 호출 → 대시보드 "completed"

## 부수 발견

- `crawl_jobs` 실제 스키마는 `total_items/processed_items` 인데 코드에는 `collected/failed` 참조가 있음 (env_common.py 확인 필요)
- `db.get(Infra, apt_id)` × 1949회 라운드트립이 Supabase pooler 7분 timeout 원인 — bulk select로 개선 여지
- Supabase MCP는 org 첫 프로젝트만 반환해서 여러 프로젝트 있는 계정에선 위험. **사용자 피드백: MCP vs CLI 중복이면 CLI 우선, MCP 삭제 선호**

## 기록

- `memory/project_childcare_trigger_bug.md` 신규 (재현 경로 + 원인 + 세션 39 수정 플랜 3파일/~25줄)
- `memory/feedback_mcp_cli.md` 신규 (MCP vs CLI 선호 피드백)
- `memory/MEMORY.md` 인덱스 2줄 추가

## 미완료 / 세션 39로 이월

- **A**: cpmsapi030 올바른 파라미터 형식 curl 검증 (수정 전 필수)
- **B**: `childcare_api.py` 2곳 수정 (errcode 즉시 return + arcode/stcode 분리)
- **C**: `env_childcare.py` silent success 방지 + bulk select 검토
- **D**: /admin 버튼 실제 트리거 + DB 검증
- **E**: Supabase MCP 2개(`claude.ai Supabase` + 플러그인 `supabase`) 해제 — CLI로는 불가, 사용자가 /mcp UI 또는 claude.ai 앱 설정에서 수동 해제

---

# 세션 37 요약 (2026-04-14)

**핵심 성과**: 4세션 미해결 모바일 onClick 먹통 이슈 해결 (커밋 5b2cd56)

- 원인 1: Header.tsx 로그인 SSR/CSR mismatch → React 19 BAILOUT_TO_CLIENT_SIDE_RENDERING
- 원인 2: FilterBar overflow-x-auto 컨테이너가 absolute 드롭다운 패널 클리핑
- 수정 3파일 / 23 insertions: Header mounted 가드 + FilterBar flex-wrap + FilterDropdown onToggleRef
- 검증: tsc/lint clean + 539 vitest + curl SSR HTML BAILOUT 마커 사라짐 + iPhone/Android 실기기 정상

**부수 작업**:
- Anthropic 공식 마켓플레이스에서 신규 5개 플러그인 설치 (typescript-lsp, pyright-lsp, code-simplifier, mcp-server-dev, skill-creator)
- .claude/settings.json에 12개 공유 스킬 + .claude/settings.local.json에 5개 로컬 스킬 (커밋 8262b4f)
- memory/project_mobile_filter_bug.md를 해결됨으로 갱신 + SSR 디버깅 재발 방지 회고

---

# 세션 35 로그 (2026-04-13)

## 작업 내용

### 1. Vercel 프로덕션 배포
- git push origin main (세션 34 커밋 2개 push)
- Vercel 자동 빌드+배포 트리거

### 2. CI 수정 (GitHub Actions Backend CI 실패)
- 원인: requirements.txt에 `requests` 패키지 누락
- 3개 테스트 파일에서 import 실패 (test_business_api, test_childcare_api, test_crime_stats_api)
- 수정: `requests>=2.31,<3` 추가

### 3. 수익률 범위 필터 구현
- BE: filter_builder/complexes에 min_yield/max_yield (float, 0~100) 파라미터 추가
- BE: query_helpers에 SQL 계산식 필터 (numeric_rent_price*12/numeric_price*100)
- FE: YIELD_PRESETS 6종 (~3%/3~5%/5~8%/8~12%/12%~)
- FE: FilterState에 minYield/maxYield + emitFilters 변환 + FilterChips 칩 + useFilterParams FLOAT_KEYS
- 월세/전체/단기임대 거래유형일 때만 UI 표시

### 4. 공유 쿼터 보호 DB 카운터 도입
- crawler/quota_db.py 신규: INSERT ON CONFLICT DO UPDATE count+1 RETURNING count
- RateLimitCounter 테이블 재활용 (마이그레이션 불필요)
- public_data_api.py, public_data_base.py: DB 카운터 우선 + in-memory 폴백
- GET /api/admin/quota-status: 오늘의 쿼터 현황 (count/limit/remaining/utilization_pct)
- _is_skip_day() 유지 (mibunyang 미연동 이중 보호)

### 5. mibunyang 네이버 429 확인
- mibunyang naver-collect.py가 모든 요청에서 429 Rate Limit
- 같은 IP 공유 → naver-estate-web 크롤러도 영향 가능
- 대응 필요: 시간 분리 재조정 또는 요청 간격 증가

### 6. 9 GATE 하네스 검증: 🟢8 🟡1 🔴0

## 검증
- tsc: 통과 | build: 통과 | lint: 기존 경고 5개 | FE test: 539 passed
- ruff: All passed | BE test: 463 passed (+8 신규)

## 다음 세션 우선순위
1. mibunyang 네이버 429 대응 (시간 분리 재조정)
2. 모바일 실기기 재테스트 (2u.pe.kr)
3. 어린이집 수동 트리거
4. 오피스텔 면적 범위 프리셋 추가
5. mibunyang 쪽 quota_db 연동
