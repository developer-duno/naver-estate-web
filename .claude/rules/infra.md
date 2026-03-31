# 인프라·운영 규칙

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
printf "새URL" | npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel --prod
```

### Vercel 프로젝트 정보

- 프로젝트: `naver-estate-web` (루트에서 배포, frontend/ 아님)
- 도메인: `2u.pe.kr`, `www.2u.pe.kr`
- 배포 명령은 **프로젝트 루트**(`z:/cursor/naver-estate-web`)에서 실행

## DB 커넥션 풀

- **NullPool** 사용 (요청마다 연결/해제) — Supabase Session Mode 동시 연결 한도 방지
- `db/database.py`에서 설정

## 스케줄러 (APScheduler)

| 작업             | 주기                   | 설명                                                                   |
| ---------------- | ---------------------- | ---------------------------------------------------------------------- |
| 전국 단지 발견   | 일요일 3시             | 네이버 키워드 검색으로 신규 단지 수집                                  |
| 매물 수집 배치   | 12시간 interval        | 최근 조회 단지 매물 크롤링 (CRAWL_INTERVAL_HOURS)                      |
| 매물 상세 보강   | 4시간 interval         | 매물 상세 정보 크롤링 (CRAWL_DETAIL_INTERVAL_MIN)                      |
| 시세 이력 수집   | 수요일 4시             | 단지별 시세(매매/전세) 주간 수집                                       |
| 인기 단지 크롤링 | 매일 10:30/14:30/19:00 | 자주 조회되는 단지 선제적 크롤링 (POPULAR_CRAWL_ENABLED)               |
| 공공데이터 수집  | 토요일 5시             | 국토교통부 실거래가 API (PUBLIC_DATA_ENABLED, 매월 10일 토요일은 skip) |

## 공유 인프라 규칙 (mibunyang 프로젝트와 공유)

### data.go.kr API 쿼터 (일일 10,000회, 동일 키 공유)

| 일자      | 프로젝트         | 워크플로우                       | 추정 호출수  |
| --------- | ---------------- | -------------------------------- | ------------ |
| 매월 1일  | mibunyang        | collect-unsold-kosis             | ~1           |
| 매월 5일  | mibunyang        | collect-population, market-stats | ~100         |
| 매월 6일  | mibunyang        | collect-trades + molit-units     | ~1,500~3,800 |
| 매월 10일 | mibunyang        | **collect-building-info**        | **~8,500**   |
| 토요일    | naver-estate-web | collect_public_trades            | ~3,600       |

- **위험일**: 매월 10일이 토요일 → 8,500 + 3,600 = 12,100 > 10,000
- **대응**: `service.py`의 `collect_public_trade_data()`에서 매월 10일 토요일이면 skip

### 네이버 크롤링 시간 분리 (같은 집 서버 IP)

| 시간              | 프로젝트         | 작업                  | 실행일             |
| ----------------- | ---------------- | --------------------- | ------------------ |
| 03:00             | naver-estate-web | discover_regions      | 일요일             |
| 04:00             | naver-estate-web | collect_prices        | 수요일             |
| 08:00             | mibunyang        | 로컬 naver-collect.py | 월/목              |
| 10:30/14:30/19:00 | naver-estate-web | popular 크롤링        | 매일               |
| 12h interval      | naver-estate-web | crawl_articles        | 매일 (시간 불고정) |
| 4h interval       | naver-estate-web | crawl_details         | 매일 (시간 불고정) |

### 공용 테이블 규칙 (같은 Supabase DB)

- 공용: `complexes`, `articles`, `complex_price_history`, `trades` (양쪽 upsert)
- mibunyang 전용: `apartments`, `unsold_history`, `regions`, `prices`, `trade_stats`, `builders`, `infra`, `schools`, `transport` (ORM: `db/mb_models.py`)
- **기존 컬럼 타입 변경/삭제 금지** — 컬럼 추가만 허용
- ALTER/DROP 전 상대 프로젝트의 SELECT 쿼리/ORM 모델 검색 필수
- 컬럼명 불일치 주의: naver-estate-web ORM은 `latitude`/`longitude`/`total_household_count`, mibunyang은 `lat`/`lng`/`total_households` (mb_models.py에서 mapped_column alias로 해결)
