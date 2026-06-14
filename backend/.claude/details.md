# Backend 깊이 자료

> 본 파일은 명시 참조 자료. 진입점 = `backend/CLAUDE.md` §토픽 인덱스.

## 실거래가 on-demand 수집 (live.py)

| 엔드포인트 | 메서드 | 인증 | 설명 |
|-----------|--------|------|------|
| `/{no}/price-history/start-collect` | POST | admin/expert | 수집 시작 (24시간 TTL, Semaphore 3, 쿼터 제한) |
| `/{no}/price-history/collect-status` | GET | 없음 | 진행 상태 폴링 |

- 24시간 내 수집 데이터 있으면 `{"status": "fresh"}` 반환 (수집 스킵)
- 백그라운드 스레드에서 `collect_price_history_for_complex()` 호출
- on-demand 전용 throttle: `_throttle_ondemand` (min 2.0s, 스케줄러와 분리)
- 수집 중 실시간 진행률: `on_progress` 콜백으로 collected/failed/total 업데이트
- 완료 시 `_price_history_cache` 캐시 무효화 (delete_by_prefix)

## mibunyang 통합 (Phase 1.5 — 읽기 + 정렬/검색)

- 같은 Supabase DB 공유 → 기존 `Base`/`SessionLocal`/`get_db()` 그대로 사용
- `db/mb_models.py`: mibunyang 10개 테이블 ORM (Apartment, UnsoldHistory, MBRegion, MBTrade 등)
- `db/mb_queries.py`: 읽기 쿼리 + 정렬/검색 헬퍼
  - `_build_mb_order_clause(sort_by)`: 아파트 동적 정렬 (9개 옵션, nullable 컬럼 NULLS LAST)
  - `_build_mb_trade_order_clause(sort_by)`: 실거래 동적 정렬 (5개 옵션, 전 키 NULLS LAST)
  - `_apply_keyword_filter(conditions, keyword)`: 단지명 ILIKE 검색 (%/_ 이스케이프)
- `routers/mb.py`: `/api/mb/*` 엔드포인트 (인증 없는 공개 API)
  - `/apartments`: `sort_by` (Literal[9]), `keyword` (min_length=2, max_length=100)
  - `/unsold`: `sort_by` (Literal[9]), `keyword`
  - `/trades`: `sort_by` (Literal[5])
  - `MbAptSortBy`, `MbTradeSortBy` Literal 타입 정의
- mibunyang 테이블: apartments(97col), unsold_history, regions, trades, prices, trade_stats, builders, infra, schools, transport
- 컬럼명 매핑: `lat`→`latitude`, `lng`→`longitude` (mapped_column alias)

## 공인중개사 검증 워크플로 (B2B 구독 모델)

```
/verify (FE) → POST /api/verify (sangji 사업자번호 10자리)
  ↓
business_api.py (국세청 odcloud API: api.odcloud.kr/api/nts-businessman/v1/validate)
  ↓ 성공
db/models.py agent_verifications.verification_status = "approved"
users.role = "expert" (자동 승인)
  ↓ 실패
verification_status = "pending"
  → 자격증 업로드 (services/storage.py: Supabase Storage, 5MB JPG/PNG/PDF)
  → /admin/users 관리자 수동 승인/거부 (routers/admin/users.py)
  → services/email.py Gmail SMTP SSL 465 알림 (best-effort)
```

- 핵심 모듈 7종: `routers/verify.py` + `routers/admin/users.py` + `crawler/business_api.py` + `crawler/vworld_client.py` + `services/storage.py` + `services/email.py` + `db/models.py` (`agent_verifications` 테이블)
- **V-WORLD 중개사 대조 (세션 308 PR B)**: 국세청은 "사업자 진위+영업중"만 봐서 식당·카페도 자동승인되는 구멍 → `crawler/vworld_client.py` `search_broker_office`(getEBOfficeInfo)로 "진짜 중개사무소"인지 실시간 대조. 게이트 = 국세청진위 AND 영업중 AND V-WORLD매칭(영업중)→approved, 미매칭/휴폐업/조회실패→pending(false negative 방어). 결과는 `broker_verified`/`broker_jurirno`/`broker_status`(V034) 정식 컬럼에 저장.
- 환경변수 (backend/.env): `PUBLIC_DATA_API_KEY` (odcloud), `VWORLD_API_KEY`+`VWORLD_DOMAIN` (V-WORLD 중개사 대조, 미설정 시 대조 skip→pending), `SMTP_HOST/PORT/USER/PASS/FROM` (Gmail)

## 미분양 중복 제거

- `extract_base_name()` — 단지명에서 차수 접미사 제거 ("푸르지오(3차)" → "푸르지오")
- `_deduplicate_apartments()` — (base_name, region, gu) 그룹에서 마지막 차수만 유지
- `get_apartments_page()` — 목록+total 단일 쿼리 반환 (기존 `get_apartments` + `count_apartments` 통합)
- `apartment_to_dict()` — name 필드에서 차수 접미사 자동 제거
