# 웹 프로젝트 코딩 규칙

## React / Next.js 규칙

### HTML Semantics (Hydration 안전)
- `<Link>` 또는 `<a>` 안에 `<tr>`, `<div>`, `<table>` 등 블록 요소를 넣지 않기
- `<tbody>`는 `<a>`를 포함할 수 없음 — 테이블 행 클릭은 `<tr onClick>` + `router.push()` 사용
- `<div className="contents">` 대신 `React.Fragment` 사용 (grid 레이아웃 시)
- 인터랙티브 요소 중첩 금지 (`<button>` 안에 `<a>`, `<a>` 안에 `<button>`)

### 데이터 페칭 (React Query 사용)
- **서버 데이터**: `useQuery` / `useMutation` 사용 (캐싱, 중복 제거, 자동 재시도)
  ```tsx
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => getStats(),
  });
  ```
- **폴링**: `refetchInterval` 옵션 (setInterval 대신)
- **캐시 무효화**: 크롤 완료 시 `queryClient.invalidateQueries()` 호출
- **로그아웃 시**: `queryClient.clear()` → 세션 간 캐시 유출 방지 (Providers.tsx)
- **플래시 방지**: 필터 변경 시 `placeholderData: keepPreviousData` 적용
- **TestQueryProvider**: 테스트에서 컴포넌트/훅 렌더링 시 래퍼로 감싸기

### State Management (메모리 누수 방지)
- useQuery/useMutation이 아닌 순수 로컬 상태(UI 토글 등)에만 useEffect + setState 사용
- 타이머(setInterval/setTimeout)는 useEffect cleanup에서 반드시 clear
- useRef로 isMounted 패턴(Header 등 전역 컴포넌트): cleanup 에서 `false` 로 내렸다면 **effect 시작부에서 반드시 `true` 로 재설정**한다. StrictMode(dev, App Router 기본 on)는 mount→cleanup→mount 를 이중 실행하므로 재설정이 없으면 두 번째 실행의 비동기 후속(getSession·구독 콜백)이 전부 조기 이탈해 화면이 옛 상태로 굳는다 — 세션 395 `Header.tsx` 실사고(next 16.3.4 admin E2E 회귀의 진짜 원인, 8월 16.3.0 사고도 같은 결함으로 추정). 회귀 테스트는 `<StrictMode>` 래핑 케이스를 포함(`Header.strictmode.test.tsx` 답습)

### 성능
- 무거운 컴포넌트는 `dynamic(() => import(...), { ssr: false })` 사용 (예: PriceChart)
- 리스트 아이템은 `React.memo`로 감싸기 (예: ComplexRow, ArticleRow)
- `<Image>` 컴포넌트 사용 필수 (raw `<img>` 금지) — alt 속성 필수
- useMemo/useCallback: 의존성 배열 정확하게 관리

## Backend / FastAPI 규칙

### shared/ 코드
- `shared/` 폴더의 코드는 데스크톱 앱과 공유 — **수정 금지, 확장만 허용**
- NaverEstateAPI는 `routers/live.py`에서만 호출

### 실시간 크롤링 (live.py)
- 모든 거래유형 포함: `tradeType=A1%3AB1%3AB2%3AB3` (매매+전세+월세+단기임대)
- TTL 캐시 필수 (5분) — 동일 요청 반복 시 네이버 API 재호출 방지
- 첫 페이지 API 실패 시 HTTPException(502) 전파 (빈 배열 반환 금지)
- DB upsert 패턴: `INSERT ON CONFLICT DO UPDATE`
- 매물(Article)은 크롤링 시 없어진 것 물리 삭제 허용 (`delete_missing_articles`). 단지(Complex)는 DELETE 금지 (line 72 참조)
- 진행 상태 폴링 응답(`crawl-status`·`collect-status`·관리자 `recrawl/progress`)은 `Cache-Control: no-store` 필수. `/api/live/` 검색 결과 max-age 를 폴링에 물려 브라우저가 3시간 캐시 → 완료 감지 불가였던 결함(세션 395)

### DB 규칙
- estate 쿼리는 `db/queries.py`, mibunyang 쿼리는 `db/mb_queries.py` 경유 (직접 SQL 금지)
- 필터링은 SQL WHERE절 (Python 메모리 필터 금지)
- 사전계산 컬럼 활용: `numeric_price`, `numeric_rent_price`, `price_per_pyeong`
- 권장 인덱스: `articles(complex_no, is_active)` 복합 인덱스

### 인증
- 보호 엔드포인트: `Depends(get_current_user)` 또는 `Depends(get_admin_user)`
- 401 응답 시 프론트엔드 자동 로그아웃 — 단 즉시 로그아웃하지 않고 `supabase.auth.getSession()`
  으로 로컬 세션 생존을 재확인한 뒤에만 로그아웃(세션 351: 멀티탭에서 Supabase 토큰 갱신
  경합으로 오탐 401 발생 시 멀쩡한 세션까지 튕기던 결함 방지, `_isLoggingOut` mutex는
  실제 로그아웃 분기 안으로 이동해 중복 방지). 403 은 승인/권한 문제라 로그아웃 대상 아님
- Supabase 토큰은 HS256(레거시 secret)·ES256(JWKS 로컬 검증, 10분 캐시) 둘 다 로컬 검증, 원격 `/auth/v1/user` 는 최후 폴백(2026-09-09 서명키 전환 사고). 두 분기 공통 leeway 60초(발급 서버와의 clock skew 로 `iat` 가 미래여도 통과 — 없으면 갱신 직후 첫 요청마다 원격 폴백. PyJWT 의 leeway 는 `exp`·`nbf` 에도 같이 적용돼 만료 토큰이 60초 더 통과한다 — Supabase 기본 만료 1시간 대비 의도된 트레이드오프), 미지 kid 네거티브 캐시는 kid 없는 토큰도 고정 센티널로 기록해 JWKS 재조회 증폭을 막고, 로그에 찍는 kid·alg·예외 메시지는 `_safe_log_value` 로 개행 제거(로그 위조 차단). 부팅 시 `_check_jwks_reachable()`(main.py lifespan)이 JWKS 도달 여부를 로그로 남긴다
- Rate limiting: `auth/rate_limiter.py` — Redis/in-memory 분기 구현 완료. `REDIS_URL` 환경변수 설정 시 Redis sorted set, 미설정 시 in-memory 폴백 자동 선택 (분산 환경 대비 완료, 단일 집 서버는 in-memory 로 충분)

### 보안
- CSP: `unsafe-eval` 사용 금지, `unsafe-inline`은 Next.js 요구 시만 허용
- CORS: `allow_origins`에 명시적 도메인만 허용 (`["*"]` 금지)
- 입력 검증: FastAPI `Query()` + `Literal[]` 사용
- SQL 파라미터화: `text().bindparams()` 또는 ORM 조건

## DON'T (절대 하지 말 것)
- `<Link>`로 `<tr>` 감싸지 않기 (hydration 에러)
- `shared/` 코드 수정하지 않기
- 비동기 콜백에서 언마운트 체크 없이 setState 호출하지 않기
- live 엔드포인트에서 에러 시 빈 배열 반환하지 않기
- dangerouslySetInnerHTML 사용하지 않기
- DB 단지(Complex) 레코드 DELETE 하지 않기 (매물은 크롤링 시 없어진 것 삭제 허용)

## mdx 발행 규칙 (GATE 10 — 162 세션 사고 답습 + 164 세션 확장)

`src/content/blog/*.mdx` 발행·수정 시 CI `npm run check:mdx-jsx` 통과 의무 (자동).

금지 패턴 5종 (mdx-js-loader 가 JSX 시작 태그로 오인해 Turbopack build 실패):

- raw `<숫자` (표 cell `<1.0`, `<60` 등) → `미만` 한글 표현
- raw `>숫자` (표 cell `>65`, `>30` 등) → `초과` 한글 표현
- raw `<=숫자` (표 cell `<=1.0` 등) → `이하` 한글 또는 `≤` 유니코드 (164 세션 확장)
- raw `>=숫자` (표 cell `>=65` 등) → `이상` 한글 또는 `≥` 유니코드 (164 세션 확장)
- 단독 `[/path/[xxx]]` (`[id]`, `[no]`, `[slug]` 등 — 마크다운 링크 컨텍스트 밖) → `[표시 텍스트](/path)` 마크다운 링크 형식

화이트리스트 (가드 통과 = 안전):
- 인라인 코드 백틱 `` `<1.0` ``
- 펜스 코드 블록 ```` ``` ````
- 마크다운 링크 `[/complex/[no]](/search)` (`](` lookahead 통과)
- 유니코드 부등호 `≤80%` / `≥1.5` (한글 표현 권장 답습)

검증: `cd frontend && npm run check:mdx-jsx`. 회귀 테스트: `frontend/scripts/__tests__/check-mdx-jsx.test.mjs` 6 케이스.

로컬 pre-commit hook 자동 차단 운영 (165 세션 신설, husky v9). `frontend/src/content/blog/*.mdx` staged 변경 감지 시 `check:mdx-jsx` + `check:ad-compliance` 둘 다 자동 실행. CI step (`Mdx-JSX guard`) + pre-commit hook 이중 안전망 = 162·163·164 사고 회귀 0차 차단. bypass `--no-verify` 금지 (긴급 hotfix 한정, CONTRIBUTING.md 답습).

## SEO 메타·OG 이미지 (별도 룰)

검색·공유 노출 규칙(og:image PNG 필수 / openGraph 직접지정 시 root opengraph-image 상속 끊김 / 클라 본문 Suspense 함정 / sitemap lastModified)은 `.claude/rules/seo-metadata.md` 참조 (세션 336 신설).
