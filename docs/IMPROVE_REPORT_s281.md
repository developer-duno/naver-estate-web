# 개선점 발굴 리포트 (세션 281, 2026-06-08)
울트라코드 워크플로우(35에이전트, 146만토큰)로 naver-estate-web 5관점 스캔 → 적대 검증 통과 15건.
발견 35 / 검증통과(REAL) 15.

사장님 결정: **🔴 모바일 터치+메모리누수 먼저 → 🟡 크롤러 N+1 순차** (한 PR씩).

---

## 🔴 1순위 — 사용자 바로 체감·저위험 (먼저 1 PR)

### [high/회귀low] search/page.tsx — setState 후 unmount 시 메모리누수: 비동기 promise chain 미정리
- **위치**: `frontend/src/app/search/page.tsx:145-160`
- **근거**: useEffect(() => { supabase.auth.getSession().then(async ({ data: { session } }) => { if (!session?.user) { setIsLoggedIn(false); return; } setIsLoggedIn(true); try { const res = await fetch(...); if (res.ok) { const me = await res.json(); setUserStatus(me.status); } } catch { /* 무시 */ } }).catch(() => setIsLoggedIn(false)); }, []);

Promise chain이 cleanup 없이 실행 중. 페이지 언마운트 시 fetch 응답이 오면 setIsLoggedIn·setUserStatus 호출하여 unmounted component warning 발생. Header.tsx는 isMountedRef로 방어하지만, search/page.tsx는 protection 없음.
- **수정 방향**: useRef로 isMountedRef 추가하고, setIsLoggedIn·setUserStatus 호출 전 체크. 또는 AbortController로 fetch 취소. cleanup 함수에서 pending promise 취소 로직 추가.
- **검증**: 
직접 코드 확인 (D:\naver-estate-web\frontend\src\app\search\page.tsx:145-160):

useEffect(() => {
  const supabase = createClient();
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session?.user) { setIsLoggedIn(false); return; }
    setIsLoggedIn(true);
    try {
      cons

### [high/회귀low] 검색결과·단지상세 페이지 — 모바일 터치타겟 너무 작음 (비교 버튼 32px 미만)
- **위치**: `frontend/src/components/search/ComplexRow.tsx:46-62, ComplexCardMobile.tsx:40-56`
- **근거**: ComplexRow 비교 버튼: px-2 py-0.5 = ~20px 높이 (md 기준). ComplexCardMobile도 px-3 py-2 = ~32px. WCAG 2.1 Level AAA 권장 44px 미충족. 모바일 환경에서 사용자가 정확히 누르기 어려움.
- **수정 방향**: px-3 py-2 → px-3 py-2.5 또는 min-h-[44px] 적용. 모바일에서는 명시적 min-h-[44px] 권장. aria-label 있으므로 스크린리더는 OK.
- **검증**: ComplexRow.tsx 46-62줄 비교 버튼: px-2 py-0.5 = 8px(좌우패딩) + ~16px(텍스트) = ~20px 높이. ComplexCardMobile.tsx 40-56줄 비교 버튼: px-3 py-2 = 16px(상하패딩) + ~14px(텍스트) = ~30px 높이. 둘 다 WCAG 2.1 Level AAA 권장 44px 미만. 모바일 환경에서 정밀한 터치 필요. 의도 설계 표시 없음(주석/테스트 없음). 현재 코드 상태 그대로 미수정.

### [medium/회귀low] 페이지네이션 버튼 — 모바일에서 터치타겟 44px 미만
- **위치**: `frontend/src/components/Pagination.tsx:20-60`
- **근거**: 모바일: px-2 py-1 = ~20px 높이. 데스크톱: md:px-3 md:py-1.5 = ~28px. WCAG 기준 44px × 44px 미충족. 특히 페이지 번호 버튼은 작아서 클릭 실수 가능성 높음.
- **수정 방향**: 모바일: min-h-[44px] 또는 py-2.5 적용. md: min-h-[40px]으로 데스크톱 공간 유지하되 모바일은 44px 보장.
- **검증**: D:\naver-estate-web\frontend\src\components\Pagination.tsx 라인 20-60에서 모든 버튼이 `px-2 py-1 md:px-3 md:py-1.5` 사용. Tailwind CSS 4 기본값에서:
- 모바일: py-1 = 4px + 텍스트 ~16px = 약 24px 높이 (44px 미충족)
- 데스크톱: py-1.5 = 6px + 텍스트 ~16px = 약 28px 높이 (44px 미충족)

WCAG 2.1 Level AAA 기준 44px × 44px 최소값 미충족. 

반면 같은 프로젝트 다

### [high/회귀none] CompareFloatingBar 비교 제거 버튼 — 터치타겟 명확하지 않음 (색상만으로 상태 전달)
- **위치**: `frontend/src/components/CompareFloatingBar.tsx:30-46`
- **근거**: 제거 버튼(x)이 inline-flex gap-1 안에 있고, 너비 명시 없음. 더 심각하게는 비교 목록 가득함 상태를 amber-50 배경색으로만 표현 — 색약자가 상태 인식 불가. aria-label은 있으나 시각적 강조 부족.
- **수정 방향**: 버튼: min-h-[28px] min-w-[28px] 또는 p-1. 가득참 상태: 배경색 외 '⚠' 아이콘(이미 있음) + 텍스트('가득 참') 강조하기.
- **검증**: D:\naver-estate-web\frontend\src\components\CompareFloatingBar.tsx 라인 36-43: 제거 버튼(x)이 `inline-flex items-center gap-1` 내에서 `hover:text-blue-900 font-bold`만 가지고 있으며, 너비/높이/패딩이 명시되지 않음. 텍스트 "x"의 크기에만 의존하므로 모바일/터치에서 WCAG 권장 최소 터치타겟(24-44px)을 만족하지 못할 가능성 높음. 또한 라인 20-28의 비교 목록 가득찬 상태(isFull)가 amber-50 

## 🟡 2순위 — 크롤러 N+1 안정성 (체감0, 새벽배치, 실익 신중판단)

### [medium/회귀low] env_air.py: Infra N+1 쿼리 패턴 — 루프 내 db.get() 라운드트립
- **위치**: `backend/crawler/env_air.py:63-66`
- **근거**: collect_air_quality 함수에서 apts 루프 내 매번 db.get(Infra, apt_id)를 호출. childcare_api.py는 이 문제를 Infra prefetch로 해결했으나(라인 45-50), env_air.py는 미적용. 배치 100건 × 1회 = 100회 추가 DB 라운드트립. Supabase pooler 7분 timeout 대응 필요(childcare 코멘트 참고).

for apt_id, lat, lng in apts:
  try:
    ...
    infra = db.get(Infra, apt_id)  # ← N+1 (매번 단일 SELECT)
    if not infra:
      failed += 1
      continue
- **수정 방향**: childcare_api.py:45-50 패턴 적용: infra_map = {obj.apartment_id: obj for obj in db.query(Infra).filter(Infra.apartment_id.in_(apt_ids)).all()} 로 일괄 prefetch. 루프 내 infra_map.get(apt_id) 사용. 예상 효과: db.get() 루프 제거 → pooler timeout 위험 감소.
- **검증**: env_air.py 라인 63-66에서 collect_air_quality 함수의 apts 루프 내에서 매 반복마다 db.get(Infra, apt_id)를 호출하고 있습니다:

```python
for apt_id, lat, lng in apts:
    try:
        ...
        infra = db.get(Infra, apt_id)  # ← 각 반복마다 SELECT 발생
        if not infra:
            failed += 1
            continue
```

이는 전형적인

### [medium/회귀low] env_emergency.py: Infra N+1 쿼리 패턴 — 동일 문제
- **위치**: `backend/crawler/env_emergency.py:36-42`
- **근거**: collect_emergency_data 함수에서도 동일한 패턴. apts 루프(약 100건) 내 매번 db.get(Infra, apt_id) 호출.

for apt_id, lat, lng in apts:
  try:
    result = EmergencyAPI.find_nearest(...)
    infra = db.get(Infra, apt_id)  # ← N+1
    if not infra:
      failed += 1
      continue
- **수정 방향**: env_air.py와 동일: prefetch dict 생성 후 루프 내 .get() 사용. 일괄 쿼리 1회로 감소.
- **검증**: 직접 코드 검증:
1. env_emergency.py:36-42: for 루프(~100회) 내 매 iteration마다 db.get(Infra, apt_id) 호출 → SQLAlchemy의 session.get()는 각각 SELECT 쿼리 발생
2. 대조 증거 env_childcare.py:45-50에서는 동일한 상황(apt 루프)에서 Infra를 사전 배치 로드(filter(Infra.apartment_id.in_(apt_ids)).all())하여 1회 쿼리로 통합하고, 루프 내에서는 dict 조회 사용
3. env_air.py:

### [medium/회귀low] env_crime.py: Infra N+1 쿼리 패턴 (2곳)
- **위치**: `backend/crawler/env_crime.py:102, 164`
- **근거**: collect_crime_stats 및 load_crime_stats 모두에서 apts 루프 내 db.get(Infra, apt_id) 호출. 예상 배치: 40,000+ 아파트 × 2회(API + CSV) = 80,000회 추가 쿼리.

for apt_id, region, gu in apts:
  result = _lookup_score(...)
  if not result and median_result:
    result = median_result
  if not result:
    skipped += 1
    continue
  infra = db.get(Infra, apt_id)  # ← N+1
- **수정 방향**: apts 쿼리 시 Infra.apartment_id IN (...) 로 eager load 또는 prefetch dict. API/CSV 분기 모두 적용.
- **검증**: 코드 직접 확인:
- D:\naver-estate-web\backend\crawler\env_crime.py:102 (collect_crime_stats)
  루프 범위: apts = db.query(Apartment.id, ...).all() (88줄, 1회)
  루프 내: for apt_id, region, gu in apts: ... infra = db.get(Infra, apt_id) (102줄)
  
- D:\naver-estate-web\backend\crawler\env_crime.py:164 (load_crime_st

### [high/회귀medium] env_crime.py: 병렬 처리 없는 40,000+ 아파트 순회 — timeout 위험
- **위치**: `backend/crawler/env_crime.py:88-112`
- **근거**: collect_crime_stats에서 apts = db.query(Apartment.id, Apartment.region, Apartment.gu).all() 후 대량 순회. 현재 db.get(Infra) N+1 + point lookup으로 순차 처리는 매우 느림. 세션 길이 timeout(Supabase 기본 5-7분) 또는 시간초과(스케줄러 30분 misfire_grace_time) 위험. prefix 감사 패턴(env_crime_population._build_population_map 활용)은 있으나 아파트별 처리는 단일 스레드.

for apt_id, region, gu in apts:  # 40,000+ 행
  result = _lookup_score(score_lookup, region, gu)  # dict lookup O(1)
  infra = db.get(Infra, apt_id)  # N+1 + 네트워크 지연
  infra.crime_score = ...
  # 배치 커밋 없음 = 메모리 누적
- **수정 방향**: 배치 커밋 도입 (50~100 건마다): if (i + 1) % 50 == 0: db.commit(). Infra prefetch dict 병합 후 메모리 부하 감소. 필요시 ThreadPoolExecutor(3-5) 병렬화 고려(_detail_worker.py 패턴).
- **검증**: 직접 코드 및 커밋 타임라인 검증:

[1] N+1 문제: 기술적으로 REAL
- 현재 코드(962f124): 줄 88-112에서 `db.query(Apartment).all()` 후 루프 내 `db.get(Infra, apt_id)` 반복
- 40,000+ 개 × 1쿼리/개 = 네트워크 지연 누적

[2] 동일 문제의 이미 구현된 해결책 존재
- env_childcare.py 커밋 07dbddd (2026-04-15): "Infra bulk prefetch" 추가
- 코드: apt_ids = [row[0] for row in ap

### [medium/회귀low] service_price.py:173-204: trade_type 루프 내 continue 후 processed 미증가 경우 존재
- **위치**: `backend/crawler/service_price.py:173-204`
- **근거**: collect_price_history에서:
for i, (complex_no,) in enumerate(complexes):
  complex_had_success = False
  for trade_type in ('A1', 'B1'):
    try:
      result = NaverEstateAPI.get_complex_prices(...)
    except Exception as e:
      logger.warning(...)
      continue  # ← 예외 시 continue, complex_had_success 미갱신

    if not result or 'error' in result:
      continue  # ← 응답 오류 시 continue, complex_had_success 미갱신

    _throttle.on_success()  # ← 정상만 호출
    complex_had_success = True  # ← 최소 1회 성공 시만 True
  if complex_had_success:
    processed += 1

문제: trade_type 2회 모두 API 호출 실패(예: 429 throttle) 
- **수정 방향**: except 블록에서도 on_rate_limit() 호출하여 throttle 상태 갱신. 또는 trade_type별 성공/실패 카운트 분리 → job.processed_items에 '부분 성공' 반영(Job.error_message에 'A1 OK, B1 실패' 기록).
- **검증**: D:\naver-estate-web\backend\crawler\service_price.py:173-204

줄 173-204 코드:
- line 176-182: try-except에서 API 호출 예외 발생 시 continue (logger.warning만 기록, failed 카운터 없음)
- line 184-185: 응답 오류 시 continue (마찬가지로 failed++ 없음)
- line 187: _throttle.on_success()는 성공 시에만 호출
- line 201: complex_had_success = Tr

## 🟢 백로그 — 접근성·코드품질 (선택)

### [medium/회귀none] 단지상세 페이지 매물테이블 — 정렬가능 컬럼 버튼에 aria-label 누락
- **위치**: `frontend/src/components/ArticleTable.tsx:161-177`
- **근거**: 정렬 가능 컬럼 헤더 버튼(TableHead 내부 button)은 aria-sort만 있고 aria-label 없음. 스크린리더 사용자가 '클릭하면 정렬된다'는 정보를 명확하게 받지 못함. 현재 title 속성만 있음(마우스오버용).
- **수정 방향**: button에 aria-label="{컬럼명} 정렬" 추가. 예: aria-label="가격 정렬 (현재 오름차순)"로 동적 상태 반영.
- **검증**: frontend/src/components/ArticleTable.tsx:162-174 의 정렬 가능 컬럼 헤더 button 엘리먼트는 title 속성만 보유하고 aria-label이 없음. WCAG 2.1 Level A/AA 요구사항상 모든 버튼은 접근 가능한 이름(accessible name)을 가져야 함. title 속성은 마우스오버 tooltip일 뿐 스크린리더에 노출되지 않음. 현재 스크린리더는 열 제목과 aria-sort 상태만 읽고, "클릭하면 정렬된다"는 버튼의 함수를 전달하지 못함. 최근 a11y 커밋들(1933fd

### [medium/회귀none] 취득세 계산기 — 숨겨진 필드 검증 에러 표시 없음 (생애최초 비활성 이유)
- **위치**: `frontend/src/app/tools/acquisition-tax/AcquisitionInputs.tsx:99-126`
- **근거**: 생애최초 체크박스가 disabled일 때 p 태그로 '오피스텔·상가는...' 안내하지만, 접근성 라벨 없음. 더 중요하게는 input disabled 상태에서 aria-describedby로 연결하지 않아 스크린리더가 비활성 이유를 자동 공지하지 못함.
- **수정 방향**: disabled input에 aria-describedby="reason-{id}"와 id="reason-{id}" p 태그 추가. 또는 aria-disabled + role=checkbox 패턴 대신 모두 aria-describedby로 통일.
- **검증**: 파일: D:\naver-estate-web\frontend\src\app\tools\acquisition-tax\AcquisitionInputs.tsx

라인 113-125:
- input type="checkbox" disabled={firstTimeDisabledReason !== null} (라인 113-118)
- aria-describedby 미설정
- aria-label 미설정  
- 비활성 사유는 p 태그로 표시 (라인 123-125)하지만 구조적 연결 없음

문제:
1. disabled input에 설명 텍스트가 있으

### [medium/회귀none] 검색 페이지 헤더 뒤로가기 버튼 — 시각적 피드백 부족 (hover 없음)
- **위치**: `frontend/src/app/search/page.tsx:200-202, complex/[no]/page.tsx 헤더`
- **근거**: 뒤로가기 버튼(←)은 text-gray-400 hover:text-gray-600 만 있고, focus 스타일 없음. 키보드 네비게이션 시 포커스 표시 불가능. aria-label 있으므로 스크린리더 OK.
- **수정 방향**: focus:outline-none focus:ring-2 focus:ring-blue-500 추가. 또는 focus-visible로 시각 피드백 제공.
- **검증**: 두 위치에서 뒤로가기 버튼 확인:

1. **D:\naver-estate-web\frontend\src\app\search\page.tsx:200**
   ```tsx
   <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl">
     ←
   </button>
   ```
   - hover만 있고 focus 스타일 전혀 없음

2. **D:\naver-estate-web\frontend\src\compon

### [medium/회귀low] 관리자 AdminCard — 도움말 아이콘(ⓘ) 접근성 문제
- **위치**: `frontend/src/components/admin/AdminCard.tsx:21-29`
- **근거**: span role="img" aria-label={help}로 구성되어 있으나, span은 대화식이 아님. 스크린리더에서는 '이미지'로 읽어지지만 클릭불가. title 속성도 없어 마우스 사용자도 도움말 표시 못함. 도움말이 <p> 태그로 아래 렌더되어 시각적으로는 보이지만 aria-describedby로 연결되지 않음.
- **수정 방향**: span → button type="button"로 변경. 또는 <span role="img"> 유지하되 title={help} 추가 + aria-describedby="{id}"로 아래 <p id={id}>와 연결.
- **검증**: File: D:\naver-estate-web\frontend\src\components\admin\AdminCard.tsx (lines 21-29)

Code examined:
```tsx
{help && (
  <span
    role="img"
    aria-label={help}
    className="text-gray-400 text-xs select-none"
  >
    ⓘ
  </span>
)}
```

Issues confirmed:
1. Non-interactive span element with role

### [medium/회귀medium] Inconsistent error handling in storage write operations — quota errors silently ignored vs logged
- **위치**: `frontend/src/lib/storage.ts:120-124, 160-164, 206-209, 256-259`
- **근거**: toggleMbFavorite (lines 120, 124) uses `try { localStorage.setItem(...) } catch { /* quota */ }` with inline comment. addMbSearchHistory (lines 160-164) uses try-catch with console.warn log. addMbCompareHistory (lines 206-209) similarly logs. addMbCompareBookmark (lines 256-259) logs. toggleFavorite (line 87) and toggleFavoriteArticle (line 341) do NOT wrap in try-catch at all. This creates inconsistent behavior when quota exceeded: some silently fail, others log, others crash.
- **수정 방향**: Extract try-catch wrapper to shared utility: `function safeSetItem(key: string, value: string, context: string): boolean { try { localStorage.setItem(...); return true; } catch(err) { if (typeof window !== 'undefined') console.warn(...); return false; } }`. Use uniformly in all 6 locations. Returns bool so caller knows if write succeeded.
- **검증**: Verified all cited lines in D:\naver-estate-web\frontend\src\lib\storage.ts:

toggleMbFavorite (120, 124): try { localStorage.setItem(...) } catch { /* quota */ } — silent
addMbSearchHistory (160-164): try { ... } catch (err) { console.warn(...) } — logged
addMbCompareHistory (206-209): try { ... } 

### [medium/회귀low] Magic number array index (17) hardcoded in useMemo — brittle to BASE_ROWS changes
- **위치**: `frontend/src/app/compare/page.tsx:181`
- **근거**: Code inserts ppRow at index 17: `rows.splice(17, 0, ppRow)`. Comment says 'after index 16 (건폐율), before index 17 (매물수)'. If BASE_ROWS structure changes, this index becomes invalid silently—no test will catch it until manually verified. Array length is 23 items; if someone adds/removes rows, splice position breaks. Better: find row by label instead of hardcoding.
- **수정 방향**: Replace `rows.splice(17, 0, ppRow)` with: `const insertIdx = rows.findIndex(r => r.label === '건폐율') + 1; rows.splice(insertIdx, 0, ppRow)`. Self-documents intent + immune to BASE_ROWS reordering. Regression risk very low (still passes tests if BASE_ROWS unchanged, and findIndex is defensive).
- **검증**: Hardcoded splice at line 181: `rows.splice(17, 0, ppRow)` inserts ppRow at index 17. Comment on line 179 confirms intent: "건폐율(인덱스 16) 다음, 매물수(인덱스 17) 앞에 삽입" (after index 16 "건폐율", before index 17 "매물수"). Currently correct because BASE_ROWS[16]="건폐율" and BASE_ROWS[17]="매물수" (lines 67-69). However, n
