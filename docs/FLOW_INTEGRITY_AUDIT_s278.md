# 전체 데이터 흐름 무결성 검토 (세션 278, 2026-06-05)

울트라코드 워크플로우(13 에이전트 / 190만 토큰 / 353 tool-use)로 수집→저장→계산→화면/텔레그램
전 경로를 읽기 전용 정밀 분석. 발견 55건 중 high/blocker 4건을 적대 재검증, 메인(Opus)이 코드로 교차검증.

## 종합 판정

**9개 흐름 단계 중 8개 정상 동작, 1개(계산)에서 실데이터 표시 버그 1건.**

| 단계 | 동작 | 핵심 |
| --- | --- | --- |
| 1. 수집 (crawler) | ✅ | 네이버 7종 throttle 강제 경유(IP차단 방지 OK), 5종 fail_job_safely 가드. **단 환경 4종 미적용(아래 H1)** |
| 2. 저장 (upsert) | ✅ | ON CONFLICT 정합, 사전계산 컬럼 NULL silent 없음, mibunyang 테이블 분리로 충돌 0 |
| 3. 계산 | ❌ | 세금5종·N→1 wolse·M2_TO_PYEONG 정확. **단 jeonse_rate 단위 버그(아래 H2)** |
| 4. 화면 표시 | ✅ | serializer↔FE타입 동기화 0 누락, 로딩/빈데이터/에러 다시시도 봉합 |
| 5. 텔레그램 | ✅ | best-effort(잡 안 죽음), 미설정 graceful skip, per-type stale 임계 정합 |
| 6. 스케줄러 | ✅ | 21잡 trigger=infra.md=META 일치, 10일토요일 skip+쿼터cap 이중방어, coalesce/max_instances |
| 7. N+1 | ✅ | 실재 2건뿐 둘 다 low(인덱스 point lookup·off-peak). relationship lazy load 0건 |
| 8. silent gap | ✅(대부분) | 266~275 가드로 봉합. 잔여 medium 몇 건(아래) |
| 9. BE↔FE 계약 | ✅ | tt_key_map↔tradeKey 짝꿍, 코드 SSOT 일치 |

---

## 🔴 즉시 고칠 가치 (high, 실증 확정)

### H1. 환경데이터 4종 `_fail_job` 이 깨진 세션 그대로 사용 → job running 영구 잔존

- **위치**: `backend/crawler/env_common.py:34-40` `_fail_job()` = 호출자 세션 `db` 로 `rollback→commit`.
- **호출처 4곳**: `env_air.py:85` / `env_emergency.py:54` / `env_crime.py:117` / `env_childcare.py:139` 의 outer except.
- **왜 문제**: 세션266이 지목한 바로 그 패턴 — 연결 끊김(SSL closed/OperationalError) 시 `rollback/commit` 이 재예외 → except 탈출 → job 이 `status='running'` 영구 잔존. 실측 선례 = 5/31 11시간(39,585초) running.
- **비대칭**: 네이버 크롤러 5종은 `service_common.py:21` `fail_job_safely`(새 SessionLocal)로 보호되는데, **환경 4종만 미적용**. 세션266 가드가 환경 수집에 전파 안 됨.
- **fix 방향**: 환경 4종 outer except 를 `fail_job_safely(job.id, ...)` 새-세션 폴백으로 통일 (#118 이 네이버 3종에 한 것과 동일). + ast 정적 가드 테스트로 누락 재발 차단.

### H2. estate `Complex.jeonse_rate` 단위 불일치 → 단지비교 전세가율 6770% 표시

- **BE 저장 단위 = 퍼센트**: `crawler/stats.py:112` `round(jeonse_median/sale_median*100, 1)` → 67.7 같은 퍼센트값. `test_service_metrics.py:55` `assert c.jeonse_rate == 67.7` 로 확정. serializer 변환 0.
- **FE 소비처 분열**:
  - ❌ `compare/page.tsx:71` = `c.jeonse_rate * 100` → **6770%**
  - ❌ `CompareRadarChart.tsx:32` = `(c.jeonse_rate ?? 0) * 100` → 레이더 축 6770
  - ✅ `InfoCards.tsx:68`, `ComplexDashboard.tsx:82` = `${c.jeonse_rate}%` → 67.7% (정상)
  - ✅ `compare-utils.ts:34` = 그대로 사용 (정상)
- **가짜 green**: 테스트 픽스처가 자기모순 — `ComplexDashboard.test.tsx:50` = 65(퍼센트, BE 진실), `CompareCharts.test.tsx:53` = 0.55(분수, 버그 소비처). 버그 소비처에 맞춘 분수 픽스처가 ×100 버그를 정확히 상쇄해 단위 테스트가 영원히 못 잡음.
- **fix 방향**: `compare/page.tsx:71` + `CompareRadarChart.tsx:32` 의 `* 100` 제거 (BE 가 이미 퍼센트). + CompareCharts 픽스처를 퍼센트(67.7)로 정정해 가드 복원.
- ⚠ mibunyang 의 `naver_jeonse_rate`/`jeonse_rate`(MbTrade/MbRegion)는 **별도 필드**라 무관 — 건드리지 말 것.

---

## 🟡 정합/관찰 (low~medium, 선택)

- **저장**: `_upsert_price_history`(`service_common.py:104`) ON CONFLICT 제약명 `complex_price_history_upsert_key` 가 마이그레이션에 없음. **prod 는 out-of-band 로 존재(082dec9 커밋이 prod 42704 맞고 코드를 prod 에 맞춤)해 동작 정상** — 재현성/재해복구 위험만. 마이그레이션 Vxxx 로 박제하거나 코드를 `uq_cph_composite` 로 정정 + dialect 분기(SQLite 테스트 0건).
- **저장 주석**: `delete_missing_articles`(`upsert.py:310`)는 물리 DELETE(의도된 설계, 테스트됨)인데 호출처 주석(`service_discover.py:205`·`_crawl_bg.py:135`)이 "is_active=False/Deactivate"로 잘못 설명. web-rules.md:47 vs :72 자체 모순. 주석·문구 정정.
- **수집 silent**: emergency 목록조회 실패를 `_complete_job(0,0)='완료'`로 위장 / air·crime 치명에러를 per-apt 실패로 흡수해 0건을 정상완료 기록. childcare 만 silent 가드 있음 → 나머지 3종에 전파 권장.
- **수집 air**: 실시간값 전부 None('-')이어도 `air_updated_at` 갱신 → 신선도 green 인데 화면 빈값 (`env_air.py:70`). childcare 식 `collected_with_matches` 가드 air 에 없음.
- **on-demand 시세**: collected=0 이어도 `status='done'` 보고(`service_price.py:144`) → 빈/옛 차트를 "수집 완료"로 오인.
- **스케줄러**: `.env.example:91` `MONITOR_INTERVAL_MIN=20` 이 prod(=10)·infra.md·META(10분)와 어긋남 — 화면은 SSOT 라 안전하나 신규 셋업 시 20분 오설정 위험. example 을 10으로.
- **화면 over-serialization**: article_status·cp_name·verification_type_code·detail_status_code·MbTrade.dealing_type·MbRegion.net_migration 6필드는 BE 직렬화+FE 타입 선언됐으나 미렌더 (dead 표시 필드, 버그 아님).

---

## N+1 결론 (가장 우려한 영역 → 양호)

- 실재 N+1 **2건뿐, 둘 다 low**:
  1. `service_metrics.py:50` 단지당 3쿼리(median×2+count). 단 EXPLAIN 상 셋 다 `idx_cph_complex` point lookup, 매일 04:30 off-peak 배치(네이버0·화면무관).
  2. `admin/jobs.py:115` job_type(≤13)당 last_error 추가쿼리(bounded, 관리자 전용).
- **relationship lazy load 행당 직렬화 쿼리 = 0건**(grep `relationship/backref/lazy=` 0). 목록 엔드포인트는 IN+GROUP BY 배치라 행수 무관 상수 쿼리.
- 세션269 enricher prefetch·세션114 검색 배치 정상 동작 확인.
- ⚠ 인덱스 추가 가설 **일절 제기 안 함**(combined_aggregate_index_void 룰 준수).

---

## 권장 처리 순서

1. **H2 (jeonse_rate)** — 사용자가 지금 잘못된 6770% 를 봄. FE 2줄 `*100` 제거 + 픽스처 정정. 최우선·최저위험.
2. **H1 (env _fail_job)** — 연결 끊김 시에만 발현하나 실측 선례 있음. 환경 4종 fail_job_safely 통일 + ast 가드. #118 패턴 답습.
3. 🟡 는 선택 — prod 영향 없는 정합/문서 작업.
