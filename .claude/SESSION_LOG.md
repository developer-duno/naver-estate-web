# 다음 세션 시작 명령어 (복붙용)

```
세션 38 시작. 이전 세션 37(2026-04-14)에서 모바일 onClick 먹통 4세션 미해결 이슈 해결됨 (커밋 5b2cd56). 이제 다음 우선순위 작업 진행.

먼저 다음 3가지 자동 점검:
1. CLAUDE.md "현재 진행 상황" 섹션 + memory/MEMORY.md 읽기
2. git log --oneline -5 로 최근 커밋 확인
3. 집 서버 health: curl -s -o /dev/null -w "%{http_code}" https://api.2u.pe.kr/api/stats (200 아니면 python scripts/startup_orchestrator.py 실행)

그 다음 아래 우선순위 중 어떤 걸 진행할지 물어봐줘:

1. 어린이집 수동 트리거 실기기 확인 (/admin → 어린이집 버튼, CHILDCARE_DETAIL_API_KEY는 .env에 있음)
2. 오피스텔 면적 범위 프리셋 추가 (frontend/src/lib/constants.ts AREA_PRESETS 확장)
3. mibunyang 쪽 quota_db 연동 (가이드 작성 완료, naver-estate-web의 quota_db.py 패턴 참고)
4. mibunyang 네이버 429 모니터링 (AdaptiveThrottle 로그 분석)
5. 사용자가 직접 지정하는 다른 작업

작업 시작 전 /harness 규칙 준수 (3파일/100줄 이하, plan mode로 먼저 설계).
```

**노트북에서 시작할 때 추가**: `먼저 git pull && /plugin (글로벌 스킬 17개 동기화)`

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
