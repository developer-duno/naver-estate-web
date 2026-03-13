# 웹 프로젝트 코딩 규칙

## React / Next.js 규칙

### HTML Semantics (Hydration 안전)
- `<Link>` 또는 `<a>` 안에 `<tr>`, `<div>`, `<table>` 등 블록 요소를 넣지 않기
- `<tbody>`는 `<a>`를 포함할 수 없음 — 테이블 행 클릭은 `<tr onClick>` + `router.push()` 사용
- `<div className="contents">` 대신 `React.Fragment` 사용 (grid 레이아웃 시)
- 인터랙티브 요소 중첩 금지 (`<button>` 안에 `<a>`, `<a>` 안에 `<button>`)

### State Management (메모리 누수 방지)
- 비동기 작업 후 setState 전에 반드시 언마운트 체크:
  ```tsx
  useEffect(() => {
    let cancelled = false;
    fetchData().then(data => { if (!cancelled) setState(data); });
    return () => { cancelled = true; };
  }, [deps]);
  ```
- 타이머(setInterval/setTimeout)는 useEffect cleanup에서 반드시 clear
- AbortController로 fetch 요청 취소: 페이지 이탈 시 pending 요청 정리
- useRef로 isMounted 패턴: Header 등 전역 컴포넌트에서 필수

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
- 매물 비활성화만 허용 (`is_active = FALSE`), DELETE 금지

### DB 규칙
- 모든 쿼리는 `db/queries.py` 경유 (직접 SQL 금지)
- 필터링은 SQL WHERE절 (Python 메모리 필터 금지)
- 사전계산 컬럼 활용: `numeric_price`, `numeric_rent_price`, `price_per_pyeong`
- 권장 인덱스: `articles(complex_no, is_active)` 복합 인덱스

### 인증
- 보호 엔드포인트: `Depends(get_current_user)` 또는 `Depends(get_admin_user)`
- 401/403 응답 시 프론트엔드 자동 로그아웃 (`_isLoggingOut` mutex로 중복 방지)
- Rate limiting: in-memory (향후 Redis 전환 필요)

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
- DB 매물 레코드 DELETE 하지 않기
