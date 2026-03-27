# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi
- **DB**: Supabase (PostgreSQL) + Supabase Auth
- **배포**: Vercel (frontend) + 집 서버 (backend, Cloudflare Tunnel)

## 아키텍처

```
[브라우저] → [Next.js (Vercel, 2u.pe.kr)]
                ↓ API 호출 (NEXT_PUBLIC_API_URL)
           [Cloudflare Tunnel (*.trycloudflare.com)]
                ↓
           [FastAPI (집 서버 192.168.219.101:8002)]
                ↓ 실시간 크롤링
           [네이버 부동산 API] → [PostgreSQL (Supabase)]
```

## 집 서버 재시작 후 복구 절차

컴퓨터를 껐다 켜면 백엔드 + 터널이 꺼지므로 아래 순서대로 실행:

### 1. 백엔드 서버 실행 (집 서버에서 cmd 열고)
```
D:
cd cursor\naver-estate-web\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8002
```

### 2. Cloudflare Tunnel 실행 (cmd 하나 더 열고)
```
cloudflared tunnel --url http://localhost:8002
```
→ `https://xxxx.trycloudflare.com` 새 URL 생성됨 (매번 바뀜)

### 3. Vercel 환경변수 업데이트 + 재배포 (개발 PC에서)
```bash
cd z:/cursor/naver-estate-web
npx vercel env rm NEXT_PUBLIC_API_URL production -y
echo "새URL" | npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel --prod
```

### Vercel 프로젝트 정보
- 프로젝트: `naver-estate-web` (루트에서 배포, frontend/ 아님)
- 도메인: `2u.pe.kr`, `www.2u.pe.kr`
- 배포 명령은 **프로젝트 루트**(`z:/cursor/naver-estate-web`)에서 실행

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 핵심 상수

- `M2_TO_PYEONG = 3.3058` (프론트/백엔드 동일)
- `LIVE_TIMEOUT_MS = 120_000` (실시간 크롤링 타임아웃)
- `get_dynamic_ttl()` (live 엔드포인트 시간대별 동적 캐시: 새벽 2시간 / 오전 15분 / 오후 30분 / 저녁 1시간)

## 거래유형 코드

| 코드 | 이름 | 설명 |
|------|------|------|
| A1 | 매매 | 매매 거래 |
| B1 | 전세 | 전세 거래 |
| B2 | 월세 | 월세 (보증금/월세) |
| B3 | 단기임대 | 단기임대 (보증금/월세) |

## 매물유형 코드

| 코드 | 이름 | 설명 |
|------|------|------|
| APT | 아파트 | 일반 아파트 |
| ABYG | 아파트분양권 | 아파트 분양권 |
| JGC | 재건축 | 재건축 단지 |
| PRE | 분양권 | 분양권 (레거시) |
| OPST | 오피스텔 | 오피스텔 |
| OBYG | 오피스텔분양권 | 오피스텔 분양권 |
| RDV | 재개발 | 재개발 단지 |

## 데이터 흐름

```
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 클릭 → DB 데이터 즉시 표시 (자동 크롤링 없음)
"데이터 갱신" 버튼 → /api/live/{no}/articles (매물 크롤링 → DB upsert → 반환)
필터 변경 → /api/complexes/{no}/articles (DB 쿼리, SQL WHERE절)
가격 추이 → /api/complexes/{no}/price-history?trade_type=&area_no= (DB 쿼리, 월별 집계)
엑셀 → /api/articles/export (pandas DataFrame → xlsx)
```

## 코딩 규칙

`.claude/rules/web-rules.md` 참조.

# 플랜 모드 규칙 (모든 /plan에 자동 적용)

## 계획 작성 시 반드시 포함할 섹션:
1. **영향 범위** — 수정 파일 목록 + 해당 파일을 import하는 파일 목록
2. **실행 순서** — 의존 관계 기반 단계 구분
3. **위험 요소** — 사이드이펙트, 보안, 데이터 유실 가능성
4. **롤백 방법** — 문제 시 되돌리는 방법
5. **테스트 계획** — 완료 후 뭘 확인해야 하는지
6. 계획에 "영향받는 파일" 섹션을 반드시 포함할 것
7. 계획 제시 후 바로 실행하지 말 것

## 자동 검증 규칙:
- 5개 이상 파일 수정 시 → 단계를 나눠서 제시
- DB 변경 포함 시 → 마이그레이션 롤백 방법 명시
- API 변경 포함 시 → 영향받는 프론트 페이지 나열
- 새 기능 추가 시 → 에러 처리·빈 데이터·로딩 상태 포함 확인