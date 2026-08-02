# 완료된 감사·사고대응 아카이브 (2026-04~06)

> 2026-08-02 문서 리뉴얼 세션에서 통합. 원본 6개 파일(IMPROVE_REPORT_s271/s281/s288,
> FLOW_INTEGRITY_AUDIT_s278, naver_cooldown_response, mibunyang_naver_cooldown_fix)은
> 삭제됨 — 내용은 이 파일과 git 이력(아래 커밋)에 보존.
>
> **판정 기준**: 각 항목을 2026-08-02 시점 코드로 재실측(grep/read)해 "완료"·"미해결" 구분.
> 완료 항목은 실측 근거만 남기고 원문 서술은 생략. 미해결 항목은
> [`docs/IMPROVEMENT_PLAN_2026-08.md`](../IMPROVEMENT_PLAN_2026-08.md)로 이관.

## 완료 확인 (재조사 불필요)

| 항목 | 원본 | 완료 근거 (2026-08-02 재실측) |
|---|---|---|
| jeonse_rate 6770% 오표시 (H2) | FLOW_INTEGRITY_AUDIT_s278 | `compare/page.tsx:72` `*100` 제거됨 + `compare.test.tsx:113-114` 회귀 테스트("6770% 절대 금지") 박제. 커밋 8d61090 (#125) |
| 환경데이터 4종 fail_job 세션 오류 시 running 영구잔존 (H1) | FLOW_INTEGRITY_AUDIT_s278 | `env_common.py:47-68` `_fail_job`이 실패 시 `fail_job_safely` 새 세션 폴백. 커밋 8d61090 (#125) |
| mb/Mb*Bar.tsx 14개 구조 중복 → MetricBar 추출 | IMPROVE_REPORT_s271 | `components/mb/MetricBar.tsx` + `metric-bar-configs.ts` 존재, 14개 Bar가 이를 소비하는 얇은 래퍼로 재구성됨 |
| env_air.py Infra N+1 (루프 내 db.get) | IMPROVE_REPORT_s281 | `env_air.py:9,45,47,72` `_prefetch_infra_map` 일괄 조회로 교체됨 |
| npm audit tmp@0.2.5 path traversal | IMPROVE_REPORT_s271 | 커밋 98ec108, 2026-08-02 재실행 `npm audit --omit=dev` 0 vulnerabilities |
| .env.example MONITOR_INTERVAL_MIN 20→10 drift | FLOW_INTEGRITY_AUDIT_s278 | `.env.example:101` 현재 `10` (prod와 일치) |
| infra.md backfill_price 행 누락 | IMPROVE_REPORT_s288 | `infra.md:147`에 해당 행 존재 |
| crawl_details statement_timeout 8s→30s | IMPROVE_REPORT_s288 | PR #142 (커밋 38cc306) 반영 |
| discover_regions/backfill_price CrawlJob 관측성 누락 | IMPROVE_REPORT_s288 | PR #142 (커밋 38cc306) 반영 |
| naver-estate-web 쪽 크롤 배치·시각분리·TTL 상향 (네이버 쿨다운 대응) | naver_cooldown_response | 세션49 당시 적용, scheduler.py 현재도 그 시각표 유지 |
| mibunyang naver-listings.mjs 요청 간격 1초→5초 | mibunyang_naver_cooldown_fix | `F:\mibunyang\scripts\collectors\naver-listings.mjs:57-58` `MIN_INTERVAL=5000`(주석 "이전 1초") 확인 |

## 미해결 → 실행 플랜으로 이관

다음 항목은 원본 문서에서 지적됐으나 2026-08-02 재실측 결과 여전히 미반영 — 우선순위와 실행 방법은
[`docs/IMPROVEMENT_PLAN_2026-08.md`](../IMPROVEMENT_PLAN_2026-08.md) 참조.

- 모바일 터치타겟 44px 미달 (`ComplexRow.tsx` 비교버튼 등, `IMPROVE_REPORT_s281`)
- `search/page.tsx` unmount 후 setState 방어(isMountedRef) 부재 (`IMPROVE_REPORT_s281`)
- admin 모달(`VerificationReview.tsx`·`UserTable.tsx`) aria-modal/포커스트랩 부재 (`IMPROVE_REPORT_s288` 이월분)
- mibunyang 쪽 data.go.kr 공유 쿼터 카운터(`rate_limit_counters` 테이블) 미연동 (`quota_db_integration.md`) — **별도 리포(F:\mibunyang) 소관**, 이 리포에서는 조치 불가

## 참고 — 원본 커밋 이력

```
38cc306 fix(crawler): 상세보강 배치 timeout 30s + backfill_price/discover 잡 관측성 (개선 s288, #142)
4d77495 docs: 개선점 발굴 리포트 s281 (15건 검증통과, 🔴4/🟡5/🟢6)
8d61090 fix: 전세가율 6770% 오표시(H2) + 환경수집 running 영구잔존 차단(H1) — 세션278 (#125)
98ec108 fix(deps): tmp path traversal 취약점 해소 (npm audit fix, exceljs 전이의존) (#116)
```

## 삭제된 원본 파일 목록 (git log로 복구 가능)

- `docs/IMPROVE_REPORT_s271.md`
- `docs/IMPROVE_REPORT_s281.md`
- `docs/IMPROVE_REPORT_s288.md`
- `docs/FLOW_INTEGRITY_AUDIT_s278.md`
- `docs/naver_cooldown_response.md`
- `docs/mibunyang_naver_cooldown_fix.md`
